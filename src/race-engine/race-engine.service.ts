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
import * as turf from '@turf/turf';

/** Match frontend raceLine.normalizeLineCrossing: starboard→up, port→down. */
function normalizeLineCrossing(crossing?: string | null): 'up' | 'down' {
  const value = String(crossing || '').toLowerCase();
  if (value === 'down' || value === 'port') return 'down';
  return 'up';
}

/** Geographic span bearing A→B (degrees). Same basis as frontend getLineBearing. */
function getLineSpanBearing(coords: [[number, number], [number, number]]): number {
  return turf.bearing(
    turf.point([coords[0][1], coords[0][0]]),
    turf.point([coords[1][1], coords[1][0]]),
  );
}

/**
 * Passage direction matching map arrows (getLinePassageBearing):
 * up/starboard = span − 90°, down/port = span + 90°.
 */
function getRequiredPassageBearing(
  coords: [[number, number], [number, number]],
  crossing?: string | null,
): number {
  const span = getLineSpanBearing(coords);
  const offset = normalizeLineCrossing(crossing) === 'up' ? -90 : 90;
  return span + offset;
}

function bearingDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * After a geometric intersection, accept only if boat motion is within 90° of the
 * designed passage arrows (rejects reverse/iskele-vs-sancak wrong way).
 */
function isLineCrossedInRequiredDirection(
  coords: [[number, number], [number, number]],
  crossing: string | undefined | null,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): boolean {
  const required = getRequiredPassageBearing(coords, crossing);
  const boatBearing = turf.bearing(
    turf.point([prevLng, prevLat]),
    turf.point([lng, lat]),
  );
  return bearingDiffDeg(boatBearing, required) <= 90;
}

/** Exact geographic point where the boat track intersects the line. */
function getLineCrossingPoint(
  coords: [[number, number], [number, number]],
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): { lat: number; lng: number } | null {
  const boatPath = turf.lineString([[prevLng, prevLat], [lng, lat]]);
  const targetLine = turf.lineString([
    [coords[0][1], coords[0][0]],
    [coords[1][1], coords[1][0]],
  ]);
  const intersects = turf.lineIntersect(boatPath, targetLine);
  if (intersects.features.length === 0) return null;
  const [crossLng, crossLat] = intersects.features[0].geometry.coordinates;
  return { lat: crossLat, lng: crossLng };
}

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
    const pt1 = turf.point([lng, lat]); // turf uses [lng, lat]
    let isCrossed = false;

    const kind = target.kind || target.type;
    const isLine = kind === 'start' || kind === 'finish' || kind === 'gate';
    let crossingPoint: { lat: number; lng: number } | null = null;

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
          crossingPoint = getLineCrossingPoint(
            target.coords,
            previousState.lng,
            previousState.lat,
            lng,
            lat,
          );
          const directionOk = isLineCrossedInRequiredDirection(
            target.coords,
            target.crossing,
            previousState.lng,
            previousState.lat,
            lng,
            lat,
          );
          if (directionOk) {
            isCrossed = true;
          } else {
            crossingPoint = null;
            this.logger.debug(
              `Boat ${boatId} rejected checkpoint ${activeTargetIndex}: wrong crossing direction (required ${normalizeLineCrossing(target.crossing)})`,
            );
          }
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
        hasRoundedCorrectly = (relativeBearing < -90) && (state.closestSide === 'port');
      } else if (rounding === 'starboard') {
        hasRoundedCorrectly = (relativeBearing > 90) && (state.closestSide === 'starboard');
      } else {
        hasRoundedCorrectly = Math.abs(relativeBearing) > 90; // Şamandırayı geçmek (yanından ileri geçiş)
      }

      // Award only when CPA side matches required rounding (wrong side never counts)
      if (state.minDistance < 0.3 && hasRoundedCorrectly) {
        isCrossed = true;
        state.minDistance = Infinity; // reset
      } else if (distance > state.minDistance + 0.1 && state.minDistance < 0.4) {
        let sideCorrect = true;
        if (rounding === 'port') sideCorrect = state.closestSide === 'port';
        if (rounding === 'starboard') sideCorrect = state.closestSide === 'starboard';

        if (sideCorrect && hasRoundedCorrectly) {
          isCrossed = true;
          state.minDistance = Infinity; // reset
        } else if (!sideCorrect && distance > 0.2) {
          this.logger.debug(
            `Boat ${boatId} rejected buoy ${activeTargetIndex}: wrong rounding side (required ${rounding}, cpa ${state.closestSide})`,
          );
          state.minDistance = Infinity;
        } else if (distance > 0.25) {
          // Cleared without completing correct rounding — reset and wait for another attempt
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
