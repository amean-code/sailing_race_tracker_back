import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackPointSource1785800000000 implements MigrationInterface {
  name = 'TrackPointSource1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "track_points"
      ADD COLUMN IF NOT EXISTS "source" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "track_points"
      DROP COLUMN IF EXISTS "source"
    `);
  }
}
