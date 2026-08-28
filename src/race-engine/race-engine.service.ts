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
  checkBuoyCheckpointCrossed,
  checkLineCheckpointCrossed,
  normalizeLineCrossing,
} from './checkpoint-detection';

@Injectable()
export class RaceEngineService {
  private readonly logger = new Logger(RaceEngineService.name);
  
  // In-memory state: boatId -> { lastLat, lastLng, lastHeading, lastTimestamp }
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
    
    // Broadcast live position to websocket
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
    };
    this.boatStates.set(boatId, seeded);
    return seeded;
  }

  private async processTrackPoint(raceId: string, boatId: string, lat: number, lng: number, heading: number, recordedAt: string) {
    // Always update memory state first so we have a valid previousState for line intersection when race starts
    let previousState = this.boatStates.get(boatId);
    if (!previousState) {
      previousState = await this.hydrateBoatState(boatId, raceId);
      // If we just hydrated the exact same latest point, skip using it as previous
      // (the incoming point may be a duplicate/near-duplicate of the last DB row)
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
      minDistance: previousState?.minDistance,
      closestSide: previousState?.closestSide,
    });

    // 1. Get Race & Course (applications are per-leg)
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

    // 3. Get last passed checkpoint index
    const passes = await this.checkpointPassRepo.find({
      where: { applicationId: app.id, raceId },
      order: { checkpointIndex: 'DESC' },
      take: 1,
    });
    
    // activeTargetIndex is the next checkpoint to pass
    // If we have passes, next is max(index) + 1. If 0 passes, next is 0 (start line).
    const activeTargetIndex = passes.length > 0 ? passes[0].checkpointIndex + 1 : 0;
    
    if (activeTargetIndex >= targets.length) {
      return; // Race already finished for this boat
    }

    const target = targets[activeTargetIndex];
    // previousState is already captured above
    // previousState was grabbed at the top of the function before setting the new state
    // Now we check if the previousState we grabbed had valid coordinates

    if (!previousState) return; // Need at least two points to form a line/vector

    // 5. Check Intersection / Rounding
    let isCrossed = false;

    const kind = target.kind || target.type;
    const isLine = kind === 'start' || kind === 'finish' || kind === 'gate';
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
            `Boat ${boatId} rejected checkpoint ${activeTargetIndex}: wrong crossing direction (required ${normalizeLineCrossing(target.crossing)})`,
          );
        }
      }
    } else if (kind === 'buoy' && target.coord) {
      const state = this.boatStates.get(boatId);
      const buoyResult = checkBuoyCheckpointCrossed(
        target.coord,
        target.rounding,
        heading,
        lat,
        lng,
        {
          minDistance: state.minDistance ?? Infinity,
          closestSide: state.closestSide,
        },
      );
      isCrossed = buoyResult.crossed;
      state.minDistance = buoyResult.state.minDistance;
      state.closestSide = buoyResult.state.closestSide;
      if (buoyResult.rejectReason === 'wrong_rounding_side') {
        this.logger.debug(
          `Boat ${boatId} rejected buoy ${activeTargetIndex}: wrong rounding side (required ${target.rounding}, cpa ${state.closestSide})`,
        );
      }
    }

    if (isCrossed) {
      this.logger.log(`Boat ${boatId} crossed checkpoint ${activeTargetIndex}`);
      
      const checkpointId = target.id ?? `CP${activeTargetIndex}`;
      
      // Calculate elapsed seconds from race start or start line
      let elapsedSeconds = null;
      if (race.raceState?.startedAt) {
        elapsedSeconds = Math.floor((new Date(recordedAt).getTime() - new Date(race.raceState.startedAt as string).getTime()) / 1000);
      } else if (activeTargetIndex > 0) {
         // get start line pass
         const startPass = await this.checkpointPassRepo.findOne({
            where: { applicationId: app.id, raceId, checkpointIndex: 0 }
         });
         if (startPass) {
            elapsedSeconds = Math.floor((new Date(recordedAt).getTime() - new Date(startPass.passedAt).getTime()) / 1000);
         }
      } else if (activeTargetIndex === 0) {
         elapsedSeconds = 0; // Started just now
      }

      // 6. Save to DB
      await this.racesService.recordCheckpointPass(raceId, {
        applicationId: app.id,
        checkpointIndex: activeTargetIndex,
        checkpointId,
        passedAt: recordedAt,
        elapsedSeconds: elapsedSeconds !== null ? elapsedSeconds : undefined,
        crossLat: crossingPoint?.lat,
        crossLng: crossingPoint?.lng,
      });

      // 7. Emit events
      this.eventEmitter.emit('checkpoint.passed', {
        raceId,
        boatId,
        applicationId: app.id,
        checkpointIndex: activeTargetIndex,
        checkpointId,
        passedAt: recordedAt,
        elapsedSeconds,
        crossLat: crossingPoint?.lat ?? null,
        crossLng: crossingPoint?.lng ?? null,
      });

      // Trigger Leaderboard Update Event
      this.eventEmitter.emit('leaderboard.updated', {
        raceId,
      });

      if (activeTargetIndex === targets.length - 1) {
         this.eventEmitter.emit('boat.finished', {
            raceId,
            boatId,
            applicationId: app.id,
            finishTime: recordedAt,
         });
      }
    }
  }
}
