import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { RacesService } from '../races/races.service';
import * as turf from '@turf/turf';

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

  private async processTrackPoint(raceId: string, boatId: string, lat: number, lng: number, heading: number, recordedAt: string) {
    // 1. Get Active Race Application
    const app = await this.applicationsRepo.findOne({
      where: { raceId, boatId, status: 'CHECKED_IN' },
    });
    if (!app) return;

    // 2. Get Race & Course
    const race = await this.racesRepo.findOne({ where: { id: raceId }, relations: ['course'] });
    if (!race || !race.course || race.status !== 'IN_PROGRESS') return;

    const course = race.course;
    const checkpoints = course.checkpoints as any[];
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
    const previousState = this.boatStates.get(boatId);

    // 4. Update memory state
    this.boatStates.set(boatId, {
      lat,
      lng,
      heading,
      recordedAt,
    });

    if (!previousState) return; // Need at least two points to form a line/vector

    // 5. Check Intersection / Rounding
    const pt1 = turf.point([lng, lat]); // turf uses [lng, lat]
    let isCrossed = false;

    const kind = target.kind || target.type;
    const isLine = kind === 'start' || kind === 'finish' || kind === 'gate';

    if (isLine) {
      if (target.coords && target.coords.length === 2) {
        const boatPath = turf.lineString([
          [previousState.lng, previousState.lat],
          [lng, lat],
        ]);
        const targetLine = turf.lineString([
          [target.coords[0][1], target.coords[0][0]],
          [target.coords[1][1], target.coords[1][0]],
        ]);
        const intersects = turf.lineIntersect(boatPath, targetLine);
        if (intersects.features.length > 0) {
          isCrossed = true;
        }
      }
    } else if (kind === 'buoy' && target.coord) {
      // Simplified buoy rounding check: check CPA (Closest Point of Approach)
      const tLat = target.coord[0];
      const tLng = target.coord[1];
      const pt2 = turf.point([tLng, tLat]);
      const distance = turf.distance(pt1, pt2, { units: 'kilometers' });

      const absoluteBearing = turf.bearing(pt1, pt2);
      let relativeBearing = absoluteBearing - heading;
      while (relativeBearing <= -180) relativeBearing += 360;
      while (relativeBearing > 180) relativeBearing -= 360;

      const rounding = target.rounding ? target.rounding.toLowerCase() : 'line';
      let hasRoundedCorrectly = false;
      
      // Store min distance in state to mimic frontend logic
      const state = this.boatStates.get(boatId);
      if (!state.minDistance) state.minDistance = Infinity;
      
      if (distance < state.minDistance) {
        state.minDistance = distance;
        state.closestSide = relativeBearing < 0 ? 'port' : 'starboard';
      }

      if (rounding === 'port') {
        hasRoundedCorrectly = (relativeBearing < -135) && (state.closestSide === 'port');
      } else if (rounding === 'starboard') {
        hasRoundedCorrectly = (relativeBearing > 135) && (state.closestSide === 'starboard');
      } else {
        hasRoundedCorrectly = Math.abs(relativeBearing) > 135;
      }

      if (state.minDistance < 0.3 && hasRoundedCorrectly) {
        isCrossed = true;
        state.minDistance = Infinity; // reset
      } else if (distance > state.minDistance + 0.1 && state.minDistance < 0.4) {
        let sideCorrect = true;
        if (rounding === 'port') sideCorrect = state.closestSide === 'port';
        if (rounding === 'starboard') sideCorrect = state.closestSide === 'starboard';

        if (sideCorrect) {
          isCrossed = true;
          state.minDistance = Infinity; // reset
        } else if (distance > 0.2) {
          state.minDistance = Infinity;
        }
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
