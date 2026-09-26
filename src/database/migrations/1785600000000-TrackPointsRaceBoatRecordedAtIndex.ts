import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackPointsRaceBoatRecordedAtIndex1785600000000
  implements MigrationInterface
{
  name = 'TrackPointsRaceBoatRecordedAtIndex1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "track_points_race_id_boat_id_recorded_at_idx"
      ON "track_points" ("race_id", "boat_id", "recorded_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "track_points_race_id_boat_id_recorded_at_idx"
    `);
  }
}
