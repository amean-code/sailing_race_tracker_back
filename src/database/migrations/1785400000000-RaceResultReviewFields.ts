import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceResultReviewFields1785400000000 implements MigrationInterface {
  name = 'RaceResultReviewFields1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "checkpoint_passes"
      ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'gps'
    `);

    await queryRunner.query(`
      ALTER TABLE "race_results"
      ADD COLUMN IF NOT EXISTS "missed_checkpoint_indexes" jsonb,
      ADD COLUMN IF NOT EXISTS "dnf_reason" text,
      ADD COLUMN IF NOT EXISTS "committee_accepted" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "committee_accepted_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_results"
      DROP COLUMN IF EXISTS "committee_accepted_at",
      DROP COLUMN IF EXISTS "committee_accepted",
      DROP COLUMN IF EXISTS "dnf_reason",
      DROP COLUMN IF EXISTS "missed_checkpoint_indexes"
    `);

    await queryRunner.query(`
      ALTER TABLE "checkpoint_passes"
      DROP COLUMN IF EXISTS "source"
    `);
  }
}
