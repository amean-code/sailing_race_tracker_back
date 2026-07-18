import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackPoint } from '../entities/track-point.entity';
import { TrackPointInputDto } from './dto/track-point.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

const INVALID_BOAT_IDS = new Set(['boat-1', '']);

@Injectable()
export class TrackPointsService {
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

    for (const point of points) {
      try {
        this.assertValidBoatId(point.boatId);
      } catch {
        failed += 1;
        continue;
      }
      try {
        const key = this.clientKey(point);
        const existing = await this.trackPointsRepo.findOne({
          where: { clientKey: key },
        });
        if (existing) {
          skipped += 1;
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
      } catch {
        failed += 1;
      }
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

  async findLatestByRace(raceId: string, limit = 500) {
    const points = await this.findAll({ raceId, limit });
    const map = new Map<string, ReturnType<typeof this.serialize>>();
    for (const pt of points) {
      if (!pt.boatId || map.has(pt.boatId)) continue;
      map.set(pt.boatId, pt);
    }
    return map;
  }
}
