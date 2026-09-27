import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackPoint } from '../entities/track-point.entity';
import { TrackPointInputDto } from './dto/track-point.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildLatestByBoatMap } from './find-latest-by-race';

const INVALID_BOAT_IDS = new Set(['boat-1', '']);
const DETAIL_CAP = 20;

@Injectable()
export class TrackPointsService {
  private readonly logger = new Logger(TrackPointsService.name);

  constructor(
    @InjectRepository(TrackPoint)
    private readonly trackPointsRepo: Repository<TrackPoint>,
    private eventEmitter: EventEmitter2,
  ) {}

  private resolveRecordedAt(point: TrackPointInputDto): Date {
    if (point.timestamp) return new Date(point.timestamp);
    if (point.recordedAt) return new Date(point.recordedAt);
    return new Date();
  }

  private clientKey(point: TrackPointInputDto): string {
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
      recordedAt: tp.recordedAt.toISOString(),
    };
  }

  private assertValidBoatId(boatId: string) {
    if (!boatId || INVALID_BOAT_IDS.has(boatId)) {
      throw new BadRequestException('Invalid boatId for track point sync');
    }
  }

  async syncBatch(points: TrackPointInputDto[]) {
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const skippedDetails: Array<{ ck: string; reason: string; ts: number }> = [];
    const failedDetails: Array<{ ck: string; reason: string; ts: number }> = [];

    const summary = this.summarizeBatch(points || []);
    this.logger.log(JSON.stringify({ event: 'GPS_SYNC_RECEIVED', ...summary }));

    for (const point of points || []) {
      const ts = this.pointTimestampMs(point);
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

      try {
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
        });
        const saved = await this.trackPointsRepo.save(entity);
        inserted += 1;

        if (point.raceId) {
          this.eventEmitter.emit('gps.received', {
            raceId: point.raceId,
            boatId: point.boatId,
            lat: point.lat,
            lng: point.lng,
            heading: point.heading ?? 0,
            recordedAt: saved.recordedAt.toISOString(),
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

  async createBatch(points: TrackPointInputDto[]) {
    const result = await this.syncBatch(points);
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
