import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Leg } from '../entities/leg.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RaceResult } from '../entities/race-result.entity';
import {
  LegKindEnum,
  RaceStatusEnum,
  RaceTypeEnum,
} from '../common/constants';

/**
 * Idempotent bootstrap: wraps legacy races (no leg_id) into Leg containers
 * and moves applications / finish positions when needed.
 */
@Injectable()
export class LegsBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(LegsBootstrapService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(Leg)
    private readonly legsRepo: Repository<Leg>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(RaceResult)
    private readonly resultsRepo: Repository<RaceResult>,
  ) {}

  async onModuleInit() {
    try {
      await this.migrateOrphanRaces();
      await this.migrateLegacyApplicationColumns();
    } catch (err: any) {
      this.logger.error(`Leg hierarchy bootstrap failed: ${err?.message || err}`);
    }
  }

  private async migrateOrphanRaces() {
    const orphans = await this.racesRepo.find({ where: { legId: IsNull() } });
    if (orphans.length === 0) return;

    this.logger.log(`Migrating ${orphans.length} races into legs…`);
    for (const race of orphans) {
      const kind =
        race.type === RaceTypeEnum.TROFE_LEG ? LegKindEnum.TROFE_LEG : LegKindEnum.REGATA;
      const leg = this.legsRepo.create({
        id: `${race.id}-leg`,
        title: race.title || 'Ayak',
        description: race.description ?? null,
        location: race.location ?? '',
        venue: race.venue ?? null,
        organizer: race.organizer ?? null,
        boatClass: race.boatClass ?? null,
        kind,
        status: race.status ?? RaceStatusEnum.OPEN,
        startDate: race.startDate,
        endDate: race.endDate,
        registrationDeadline: race.registrationDeadline ?? null,
        capacity: race.capacity ?? 30,
        assignedCommitteeId: race.assignedCommitteeId ?? null,
        trophyId: race.trophyId ?? null,
        legOrder: race.legOrder ?? null,
        createdById: race.createdById ?? null,
      });
      await this.legsRepo.save(leg);
      race.legId = leg.id;
      race.raceOrder = race.raceOrder ?? 1;
      await this.racesRepo.save(race);
    }
    this.logger.log('Race → Leg migration complete');
  }

  private async migrateLegacyApplicationColumns() {
    const hasRaceId = await this.columnExists('race_applications', 'race_id');
    const hasLegId = await this.columnExists('race_applications', 'leg_id');
    if (!hasRaceId || !hasLegId) return;

    // Copy race_id → leg_id via races.leg_id when leg_id is null
    await this.dataSource.query(`
      UPDATE race_applications a
      SET leg_id = r.leg_id
      FROM races r
      WHERE a.race_id = r.id
        AND (a.leg_id IS NULL OR a.leg_id = '')
        AND r.leg_id IS NOT NULL
    `);

    const hasFinish = await this.columnExists('race_applications', 'finish_position');
    if (hasFinish) {
      await this.dataSource.query(`
        INSERT INTO race_results (id, application_id, race_id, finish_position, status, fleet_size, created_at, updated_at)
        SELECT
          a.id || '-result',
          a.id,
          a.race_id,
          a.finish_position,
          CASE
            WHEN a.status IN ('DNS', 'DNF', 'DSQ') THEN a.status
            WHEN a.finish_position IS NOT NULL THEN 'FINISHED'
            ELSE 'PENDING'
          END,
          a.fleet_size,
          now(),
          now()
        FROM race_applications a
        WHERE a.race_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM race_results rr
            WHERE rr.application_id = a.id AND rr.race_id = a.race_id
          )
      `);
    }
  }

  private async columnExists(table: string, column: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
      LIMIT 1
      `,
      [table, column],
    );
    return rows.length > 0;
  }
}
