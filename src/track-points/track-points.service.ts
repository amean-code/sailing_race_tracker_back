import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  DEVICE_LIVE_EMIT_MAX_AGE_MS,
  DEVICE_LIVE_MAX_AGE_MS,
  DeviceStatusEnum,
  PHONE_SOURCE_PREFERENCE_TTL_MS,
  TrackPointSourceEnum,
} from '../common/constants';
import { Device } from '../entities/device.entity';
import { DeviceLiveEmitWatermark } from '../entities/device-live-emit-watermark.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { TrackPointInputDto } from './dto/track-point.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildLatestByBoatMap } from './find-latest-by-race';
import {
  DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
  DEVICE_EMIT_ADVISORY_LOCK_SQL,
} from './device-emit-lock.logic';
import { isPgUniqueViolation } from './device-emit-watermark.logic';
import {
  collectActivePreferPhoneBoats,
  evaluateDeviceLiveEmit,
  refreshPreferPhoneExpiry,
  shouldEmitLiveGps,
  shouldSkipPwaForLiveDevice,
} from './track-point-source.logic';

const INVALID_BOAT_IDS = new Set(['boat-1', '']);
const DETAIL_CAP = 20;

export type SyncBatchOptions = {
  preferPhoneSource?: boolean;
};

type GpsReceivedPayload = {
  raceId: string;
  boatId: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number | null;
  recordedAt: string;
  source: TrackPointSourceEnum;
  deviceId: string | null;
};

@Injectable()
export class TrackPointsService {
  private readonly logger = new Logger(TrackPointsService.name);

  /** boatId → prefer-phone preference expiry (ms). */
  private readonly preferPhoneUntilByBoat = new Map<string, number>();

  constructor(
    @InjectRepository(TrackPoint)
    private readonly trackPointsRepo: Repository<TrackPoint>,
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    private readonly dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  private async acquireDeviceEmitBoatLock(manager: EntityManager, boatId: string) {
    await manager.query(DEVICE_EMIT_ADVISORY_LOCK_SQL, [
      boatId,
      DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
    ]);
  }

  /**
   * Device + raceId path: lock boat → insert → read durable watermark →
   * decide emit → advance watermark only on emit → commit → emit after commit.
   */
  private async persistDevicePointWithEmitGate(args: {
    point: TrackPointInputDto;
    key: string;
    source: TrackPointSourceEnum;
    deviceId: string | null;
    preferPhoneBoats: Set<string>;
    nowMs: number;
  }): Promise<{
    inserted: boolean;
    skippedDuplicate: boolean;
    emitPayload: GpsReceivedPayload | null;
  }> {
    const { point, key, source, deviceId, preferPhoneBoats, nowMs } = args;

    // emitPayload is returned only after successful COMMIT.
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.acquireDeviceEmitBoatLock(manager, point.boatId);

        const existing = await manager.findOne(TrackPoint, {
          where: { clientKey: key },
        });
        if (existing) {
          return {
            inserted: false,
            skippedDuplicate: true,
            emitPayload: null,
          };
        }

        const entity = manager.create(TrackPoint, {
          boatId: point.boatId,
          courseId: point.courseId ?? null,
          raceId: point.raceId ?? null,
          lat: point.lat,
          lng: point.lng,
          heading: point.heading ?? null,
          speed: point.speed ?? null,
          accuracy: point.accuracy ?? null,
          recordedAt: this.resolveRecordedAt(point),
          clientKey: key,
          source,
          deviceId,
        });
        const saved = await manager.save(TrackPoint, entity);

        if (!point.raceId) {
          return {
            inserted: true,
            skippedDuplicate: false,
            emitPayload: null,
          };
        }

        const wmRepo = manager.getRepository(DeviceLiveEmitWatermark);
        const wm = await wmRepo.findOne({
          where: { boatId: point.boatId },
          lock: { mode: 'pessimistic_write' },
        });
        const lastEmittedMs = wm ? wm.lastEmittedRecordedAt.getTime() : null;
        const recordedAtMs = saved.recordedAt.getTime();

        const decision = evaluateDeviceLiveEmit({
          recordedAtMs,
          lastEmittedMs,
          nowMs,
          maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
          boatId: point.boatId,
          preferPhoneBoats,
        });

        if (!decision.emit) {
          this.logger.log(
            JSON.stringify({
              event: 'GPS_DEVICE_EMIT_SKIPPED',
              reason: decision.reason,
              boatId: point.boatId,
              deviceId,
              recordedAt: saved.recordedAt.toISOString(),
              lastEmittedAt:
                lastEmittedMs != null
                  ? new Date(lastEmittedMs).toISOString()
                  : null,
              ageMs: nowMs - recordedAtMs,
            }),
          );
          return {
            inserted: true,
            skippedDuplicate: false,
            emitPayload: null,
          };
        }

        if (!wm) {
          await wmRepo.save(
            wmRepo.create({
              boatId: point.boatId,
              lastEmittedRecordedAt: saved.recordedAt,
            }),
          );
        } else if (recordedAtMs >= wm.lastEmittedRecordedAt.getTime()) {
          wm.lastEmittedRecordedAt = saved.recordedAt;
          await wmRepo.save(wm);
        }

        return {
          inserted: true,
          skippedDuplicate: false,
          emitPayload: {
            raceId: point.raceId,
            boatId: point.boatId,
            lat: point.lat,
            lng: point.lng,
            heading: point.heading ?? 0,
            speed: point.speed ?? null,
            recordedAt: saved.recordedAt.toISOString(),
            source,
            deviceId,
          },
        };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        return {
          inserted: false,
          skippedDuplicate: true,
          emitPayload: null,
        };
      }
      throw err;
    }
  }

  private resolveRecordedAt(point: TrackPointInputDto): Date {
    if (point.timestamp) return new Date(point.timestamp);
    if (point.recordedAt) return new Date(point.recordedAt);
    return new Date();
  }

  private resolveSource(point: TrackPointInputDto): TrackPointSourceEnum {
    if (point.source === TrackPointSourceEnum.DEVICE) return TrackPointSourceEnum.DEVICE;
    return TrackPointSourceEnum.PWA;
  }

  private clientKey(point: TrackPointInputDto): string {
    if (point.clientKey) return point.clientKey;
    const ts = point.timestamp ?? new Date(point.recordedAt ?? Date.now()).getTime();
    return `${point.boatId}:${ts}`;
  }

  private pointTimestampMs(point: TrackPointInputDto): number {
    if (point.timestamp != null) return Number(point.timestamp);
    if (point.recordedAt) return new Date(point.recordedAt).getTime();
    return Date.now();
  }

  private summarizeBatch(points: TrackPointInputDto[]) {
    const boatIds = [...new Set(points.map((p) => p.boatId).filter(Boolean))];
    const raceIds = [...new Set(points.map((p) => p.raceId).filter(Boolean))];
    let oldestTs: number | null = null;
    let newestTs: number | null = null;
    for (const p of points) {
      const ts = this.pointTimestampMs(p);
      if (oldestTs == null || ts < oldestTs) oldestTs = ts;
      if (newestTs == null || ts > newestTs) newestTs = ts;
    }
    return {
      batchSize: points.length,
      boatIds,
      raceIds,
      oldestTs,
      newestTs,
      ckFirst: points.length ? this.clientKey(points[0]) : null,
      ckLast: points.length ? this.clientKey(points[points.length - 1]) : null,
    };
  }

  private capDetails<T>(items: T[]): T[] {
    return items.slice(0, DETAIL_CAP);
  }

  serialize(tp: TrackPoint) {
    return {
      id: tp.id,
      boatId: tp.boatId,
      courseId: tp.courseId,
      raceId: tp.raceId,
      lat: tp.lat,
      lng: tp.lng,
      heading: tp.heading,
      speed: tp.speed,
      accuracy: tp.accuracy,
      source: tp.source ?? null,
      deviceId: tp.deviceId ?? null,
      recordedAt: tp.recordedAt.toISOString(),
    };
  }

  private assertValidBoatId(boatId: string) {
    if (!boatId || INVALID_BOAT_IDS.has(boatId)) {
      throw new BadRequestException('Invalid boatId for track point sync');
    }
  }

  /** ACTIVE assigned devices whose lastSeen is within the live window. */
  private async loadLiveDeviceBoatIds(boatIds: string[], nowMs = Date.now()): Promise<Set<string>> {
    const unique = [...new Set(boatIds.filter(Boolean))];
    if (unique.length === 0) return new Set();

    const devices = await this.devicesRepo.find({
      where: {
        assignedBoatId: In(unique),
        status: DeviceStatusEnum.ACTIVE,
      },
    });

    const live = new Set<string>();
    for (const device of devices) {
      if (!device.assignedBoatId || !device.lastSeenAt) continue;
      const age = nowMs - device.lastSeenAt.getTime();
      if (age >= 0 && age <= DEVICE_LIVE_MAX_AGE_MS) {
        live.add(device.assignedBoatId);
      }
    }
    return live;
  }

  /**
   * Lookup for sailor active-race payloads: assigned ACTIVE device + live flag.
   */
  async findTrackingDevicesByBoatIds(boatIds: string[], nowMs = Date.now()) {
    const unique = [...new Set(boatIds.filter(Boolean))];
    if (unique.length === 0) {
      return new Map<
        string,
        {
          id: string;
          lastSeenAt: string | null;
          live: boolean;
          lastLat: number | null;
          lastLng: number | null;
        }
      >();
    }

    const devices = await this.devicesRepo.find({
      where: {
        assignedBoatId: In(unique),
        status: DeviceStatusEnum.ACTIVE,
      },
      order: { lastSeenAt: 'DESC' },
    });

    const byBoat = new Map<
      string,
      {
        id: string;
        lastSeenAt: string | null;
        live: boolean;
        lastLat: number | null;
        lastLng: number | null;
      }
    >();
    for (const device of devices) {
      if (!device.assignedBoatId || byBoat.has(device.assignedBoatId)) continue;
      const lastSeenAt = device.lastSeenAt ? device.lastSeenAt.toISOString() : null;
      const age = device.lastSeenAt ? nowMs - device.lastSeenAt.getTime() : Number.POSITIVE_INFINITY;
      const live = Number.isFinite(age) && age >= 0 && age <= DEVICE_LIVE_MAX_AGE_MS;
      byBoat.set(device.assignedBoatId, {
        id: device.id,
        lastSeenAt,
        live,
        lastLat: device.lastLat ?? null,
        lastLng: device.lastLng ?? null,
      });
    }
    return byBoat;
  }

  async syncBatch(points: TrackPointInputDto[], options: SyncBatchOptions = {}) {
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const skippedDetails: Array<{ ck: string; reason: string; ts: number }> = [];
    const failedDetails: Array<{ ck: string; reason: string; ts: number }> = [];

    const summary = this.summarizeBatch(points || []);
    this.logger.log(JSON.stringify({
      event: 'GPS_SYNC_RECEIVED',
      ...summary,
      preferPhoneSource: Boolean(options.preferPhoneSource),
    }));

    const batchBoatIds = [...new Set((points || []).map((p) => p.boatId).filter(Boolean))];
    const nowMs = Date.now();
    if (options.preferPhoneSource) {
      refreshPreferPhoneExpiry(
        this.preferPhoneUntilByBoat,
        batchBoatIds,
        nowMs,
        PHONE_SOURCE_PREFERENCE_TTL_MS,
      );
    }
    const preferPhoneBoats = collectActivePreferPhoneBoats(
      this.preferPhoneUntilByBoat,
      batchBoatIds,
      nowMs,
    );

    const pwaBoatIds = (points || [])
      .filter((p) => this.resolveSource(p) !== TrackPointSourceEnum.DEVICE)
      .map((p) => p.boatId);
    const liveDeviceBoats = await this.loadLiveDeviceBoatIds(pwaBoatIds, nowMs);

    for (const point of points || []) {
      const ts = this.pointTimestampMs(point);
      const source = this.resolveSource(point);
      let key: string;
      try {
        key = this.clientKey(point);
      } catch (err: any) {
        failed += 1;
        failedDetails.push({
          ck: `${point?.boatId ?? 'unknown'}:${ts}`,
          reason: `client_key_error:${err?.message || err}`,
          ts,
        });
        continue;
      }

      try {
        this.assertValidBoatId(point.boatId);
      } catch (err: any) {
        failed += 1;
        failedDetails.push({
          ck: key,
          reason: 'invalid_boat_id',
          ts,
        });
        this.logger.warn(
          JSON.stringify({
            event: 'GPS_SYNC_POINT_FAILED',
            ck: key,
            ts,
            boatId: point.boatId,
            raceId: point.raceId ?? null,
            reason: 'invalid_boat_id',
            error: err?.message || String(err),
          }),
        );
        continue;
      }

      if (
        shouldSkipPwaForLiveDevice({
          source,
          boatId: point.boatId,
          liveDeviceBoats,
          preferPhoneBoats,
        })
      ) {
        skipped += 1;
        if (skippedDetails.length < DETAIL_CAP) {
          skippedDetails.push({ ck: key, reason: 'device_primary', ts });
        }
        continue;
      }

      try {
        const deviceId =
          source === TrackPointSourceEnum.DEVICE ? (point.deviceId ?? null) : null;

        // Device path: durable watermark + advisory lock + emit-after-commit.
        if (source === TrackPointSourceEnum.DEVICE) {
          const deviceResult = await this.persistDevicePointWithEmitGate({
            point,
            key,
            source,
            deviceId,
            preferPhoneBoats,
            nowMs: Date.now(),
          });
          if (deviceResult.skippedDuplicate) {
            skipped += 1;
            if (skippedDetails.length < DETAIL_CAP) {
              skippedDetails.push({ ck: key, reason: 'duplicate_client_key', ts });
            }
            continue;
          }
          if (deviceResult.inserted) {
            inserted += 1;
          }
          if (deviceResult.emitPayload) {
            this.eventEmitter.emit('gps.received', deviceResult.emitPayload);
          }
          continue;
        }

        // PWA path unchanged: no device OOO/stale/watermark gates.
        const existing = await this.trackPointsRepo.findOne({
          where: { clientKey: key },
        });
        if (existing) {
          skipped += 1;
          if (skippedDetails.length < DETAIL_CAP) {
            skippedDetails.push({ ck: key, reason: 'duplicate_client_key', ts });
          }
          continue;
        }

        const entity = this.trackPointsRepo.create({
          boatId: point.boatId,
          courseId: point.courseId ?? null,
          raceId: point.raceId ?? null,
          lat: point.lat,
          lng: point.lng,
          heading: point.heading ?? null,
          speed: point.speed ?? null,
          accuracy: point.accuracy ?? null,
          recordedAt: this.resolveRecordedAt(point),
          clientKey: key,
          source,
          deviceId,
        });
        const saved = await this.trackPointsRepo.save(entity);
        inserted += 1;

        if (
          point.raceId &&
          shouldEmitLiveGps({
            source,
            boatId: point.boatId,
            preferPhoneBoats,
          })
        ) {
          this.eventEmitter.emit('gps.received', {
            raceId: point.raceId,
            boatId: point.boatId,
            lat: point.lat,
            lng: point.lng,
            heading: point.heading ?? 0,
            speed: point.speed ?? null,
            recordedAt: saved.recordedAt.toISOString(),
            source,
            deviceId,
          });
        }
      } catch (err: any) {
        failed += 1;
        const reason = `db_error:${err?.message || err}`;
        if (failedDetails.length < DETAIL_CAP) {
          failedDetails.push({ ck: key, reason, ts });
        }
        this.logger.error(
          JSON.stringify({
            event: 'GPS_SYNC_POINT_FAILED',
            ck: key,
            ts,
            boatId: point.boatId,
            raceId: point.raceId ?? null,
            reason,
          }),
        );
      }
    }

    const partial = failed > 0 && (inserted > 0 || skipped > 0);
    this.logger.log(
      JSON.stringify({
        event: 'GPS_SYNC_RESULT',
        ...summary,
        inserted,
        skipped,
        failed,
        partial,
        preferPhoneBoats: [...preferPhoneBoats],
        skippedSample: this.capDetails(skippedDetails),
        failedSample: this.capDetails(failedDetails),
      }),
    );

    if (partial) {
      this.logger.warn(
        JSON.stringify({
          event: 'GPS_SYNC_PARTIAL',
          batchSize: summary.batchSize,
          inserted,
          skipped,
          failed,
          boatIds: summary.boatIds,
          raceIds: summary.raceIds,
          oldestTs: summary.oldestTs,
          newestTs: summary.newestTs,
          failedSample: this.capDetails(failedDetails),
          skippedSample: this.capDetails(skippedDetails),
        }),
      );
    }

    return { inserted, skipped, failed, success: inserted + skipped > 0 };
  }

  async createBatch(points: TrackPointInputDto[], options: SyncBatchOptions = {}) {
    const result = await this.syncBatch(points, options);
    return { count: result.inserted, ...result };
  }

  async findAll(filters: {
    boatId?: string;
    raceId?: string;
    since?: string;
    limit?: number;
  }) {
    const qb = this.trackPointsRepo
      .createQueryBuilder('tp')
      .orderBy('tp.recorded_at', 'DESC');

    if (filters.boatId) {
      qb.andWhere('tp.boat_id = :boatId', { boatId: filters.boatId });
    }
    if (filters.raceId) {
      qb.andWhere('tp.race_id = :raceId', { raceId: filters.raceId });
    }
    if (filters.since) {
      qb.andWhere('tp.recorded_at >= :since', { since: new Date(filters.since) });
    }
    qb.take(filters.limit ?? 500);

    const points = await qb.getMany();
    return points.map((p) => this.serialize(p));
  }

  async findLive(limit = 50) {
    const points = await this.trackPointsRepo.find({
      order: { recordedAt: 'DESC' },
      take: limit,
    });
    return points.map((p) => this.serialize(p));
  }

  /**
   * Latest GPS point per boat in a race (independent of other boats' GPS frequency).
   * Uses PostgreSQL DISTINCT ON — not a global LIMIT window.
   */
  async findLatestByRace(raceId: string) {
    const points = await this.trackPointsRepo
      .createQueryBuilder('tp')
      .distinctOn(['tp.boat_id'])
      .where('tp.race_id = :raceId', { raceId })
      .orderBy('tp.boat_id')
      .addOrderBy('tp.recorded_at', 'DESC')
      .addOrderBy('tp.id', 'DESC')
      .getMany();

    return buildLatestByBoatMap(points.map((tp) => this.serialize(tp)));
  }
}
