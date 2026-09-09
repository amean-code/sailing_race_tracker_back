import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { RacesService } from '../races/races.service';
import {
  allCheckpointsPassed,
  CHECKPOINT_PASS_SOURCE_GPS,
  firstUnpassedIndex,
  getCandidateCheckpointIndexes,
  passedIndexSet,
} from '../common/checkpoint-progress';
import {
  checkBuoyCheckpointCrossed,
  checkLineCheckpointCrossed,
  normalizeLineCrossing,
} from './checkpoint-detection';

@Injectable()
export class RaceEngineService {
  private readonly logger = new Logger(RaceEngineService.name);

  // In-memory state: boatId -> { lastLat, lastLng, lastHeading, buoyByIndex }
  private boatStates = new Map<string, any>();

  constructor(
    @InjectRepository(Race) private racesRepo: Repository<Race>,
    @InjectRepository(Course) private coursesRepo: Repository<Course>,
    @InjectRepository(RaceApplication) private applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(CheckpointPass) private checkpointPassRepo: Repository<CheckpointPass>,
    @InjectRepository(TrackPoint) private trackPointsRepo: Repository<TrackPoint>,
    private racesService: RacesService,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('gps.received')
  async handleGpsReceived(payload: { raceId: string; boatId: string; lat: number; lng: number; heading: number; recordedAt: string }) {
    const { raceId, boatId, lat, lng, heading, recordedAt } = payload;

    this.eventEmitter.emit('boat.position.updated', {
      raceId,
      boatId,
      lat,
      lng,
      heading,
      recordedAt,
    });

    try {
      await this.processTrackPoint(raceId, boatId, lat, lng, heading, recordedAt);
    } catch (err: any) {
      this.logger.error(`Error processing track point for boat ${boatId}: ${err.message}`);
    }
  }

  /** After server restart, seed previous position from DB so line crosses still work. */
  private async hydrateBoatState(boatId: string, raceId: string) {
    if (this.boatStates.has(boatId)) return this.boatStates.get(boatId);

    const lastPoint = await this.trackPointsRepo.findOne({
      where: { boatId, raceId },
      order: { recordedAt: 'DESC' },
    });
    if (!lastPoint) return undefined;

    const seeded = {
      lat: lastPoint.lat,
      lng: lastPoint.lng,
      heading: lastPoint.heading ?? 0,
      recordedAt: lastPoint.recordedAt.toISOString(),
      buoyByIndex: {},
    };
    this.boatStates.set(boatId, seeded);
    return seeded;
  }

  private async processTrackPoint(raceId: string, boatId: string, lat: number, lng: number, heading: number, recordedAt: string) {
    let previousState = this.boatStates.get(boatId);
    if (!previousState) {
      previousState = await this.hydrateBoatState(boatId, raceId);
      if (
        previousState &&
        Math.abs(previousState.lat - lat) < 1e-9 &&
        Math.abs(previousState.lng - lng) < 1e-9
      ) {
        previousState = undefined;
      }
    }

    this.boatStates.set(boatId, {
      lat,
      lng,
      heading,
      recordedAt,
      buoyByIndex: previousState?.buoyByIndex ?? {},
    });

    const race = await this.racesRepo.findOne({ where: { id: raceId }, relations: ['course'] });
    if (!race || !race.legId || race.status !== 'IN_PROGRESS') return;

    const app = await this.applicationsRepo.findOne({
      where: [
        { legId: race.legId, boatId, status: 'APPROVED' as any },
        { legId: race.legId, boatId, status: 'CHECKED_IN' as any },
      ],
    });
    if (!app) return;

    let checkpoints: any[] = [];
    if (race.courseSnapshot && Array.isArray(race.courseSnapshot.checkpoints)) {
      checkpoints = race.courseSnapshot.checkpoints;
    } else if (race.course && Array.isArray(race.course.checkpoints)) {
      checkpoints = race.course.checkpoints as any[];
    }

    if (!checkpoints || checkpoints.length === 0) return;

    const targets = checkpoints.filter((cp) => {
      const k = cp.kind || cp.type;
      return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
    });

    const existingPasses = await this.checkpointPassRepo.find({
      where: { applicationId: app.id, raceId },
    });
    const passed = passedIndexSet(existingPasses);

    if (allCheckpointsPassed(passed, targets.length)) {
      return;
    }

    if (!previousState) return;

    const boatState = this.boatStates.get(boatId);
    if (!boatState.buoyByIndex) boatState.buoyByIndex = {};

    let recordedAny = false;
    let keepChecking = true;

    while (keepChecking) {
      keepChecking = false;
      const candidates = getCandidateCheckpointIndexes(passed, targets.length);
      for (const checkpointIndex of candidates) {
        const target = targets[checkpointIndex];
        if (!target) continue;

        const kind = target.kind || target.type;
        const isLine = kind === 'start' || kind === 'finish' || kind === 'gate';
        let isCrossed = false;
        let crossingPoint: { lat: number; lng: number } | null = null;

        if (isLine) {
          if (target.coords && target.coords.length === 2) {
            const lineResult = checkLineCheckpointCrossed(
              target.coords,
              target.crossing,
              previousState.lng,
              previousState.lat,
              lng,
              lat,
            );
            if (lineResult.crossed) {
              isCrossed = true;
              crossingPoint = lineResult.crossingPoint;
            } else if (lineResult.rejectReason === 'wrong_direction') {
              this.logger.debug(
                `Boat ${boatId} rejected checkpoint ${checkpointIndex}: wrong crossing direction (required ${normalizeLineCrossing(target.crossing)})`,
              );
            }
          }
        } else if (kind === 'buoy' && target.coord) {
          const buoyState = boatState.buoyByIndex[checkpointIndex] ?? {
            minDistance: Infinity,
            closestSide: undefined,
          };
          const buoyResult = checkBuoyCheckpointCrossed(
            target.coord,
            target.rounding,
            heading,
            lat,
            lng,
            {
              minDistance: buoyState.minDistance ?? Infinity,
              closestSide: buoyState.closestSide,
            },
          );
          isCrossed = buoyResult.crossed;
          boatState.buoyByIndex[checkpointIndex] = buoyResult.state;
          if (buoyResult.rejectReason === 'wrong_rounding_side') {
            this.logger.debug(
              `Boat ${boatId} rejected buoy ${checkpointIndex}: wrong rounding side (required ${target.rounding}, cpa ${buoyResult.state.closestSide})`,
            );
          }
        }

        if (!isCrossed) continue;

        this.logger.log(`Boat ${boatId} crossed checkpoint ${checkpointIndex}`);

        const checkpointId = target.id ?? `CP${checkpointIndex}`;
        let elapsedSeconds: number | null = null;
        if (race.raceState?.startedAt) {
          elapsedSeconds = Math.floor(
            (new Date(recordedAt).getTime() - new Date(race.raceState.startedAt as string).getTime()) / 1000,
          );
        } else if (checkpointIndex > 0) {
          const startPass = existingPasses.find((p) => p.checkpointIndex === 0);
          if (startPass) {
            elapsedSeconds = Math.floor(
              (new Date(recordedAt).getTime() - new Date(startPass.passedAt).getTime()) / 1000,
            );
          }
        } else {
          elapsedSeconds = 0;
        }

        await this.racesService.recordCheckpointPass(raceId, {
          applicationId: app.id,
          checkpointIndex,
          checkpointId,
          passedAt: recordedAt,
          elapsedSeconds: elapsedSeconds !== null ? elapsedSeconds : undefined,
          crossLat: crossingPoint?.lat,
          crossLng: crossingPoint?.lng,
          source: CHECKPOINT_PASS_SOURCE_GPS,
        });

        passed.add(checkpointIndex);
        existingPasses.push({
          checkpointIndex,
          passedAt: new Date(recordedAt),
        } as CheckpointPass);
        recordedAny = true;
        keepChecking = true;

        const activeTargetIndex = firstUnpassedIndex(passed, targets.length);
        const finished = allCheckpointsPassed(passed, targets.length);

        this.eventEmitter.emit('checkpoint.passed', {
          raceId,
          boatId,
          applicationId: app.id,
          checkpointIndex,
          checkpointId,
          passedAt: recordedAt,
          elapsedSeconds,
          crossLat: crossingPoint?.lat ?? null,
          crossLng: crossingPoint?.lng ?? null,
          activeTargetIndex,
          hasFinished: finished,
        });

        if (finished) {
          this.eventEmitter.emit('boat.finished', {
            raceId,
            boatId,
            applicationId: app.id,
            finishTime: recordedAt,
          });
        }

        break;
      }
    }

    if (recordedAny) {
      this.eventEmitter.emit('leaderboard.updated', {
        raceId,
      });
    }
  }
}
