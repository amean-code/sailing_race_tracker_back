import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceCompetitors1700000000007 implements MigrationInterface {
  name = 'RaceCompetitors1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_applications"
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "boat_id" TEXT,
      ADD COLUMN IF NOT EXISTS "user_id" TEXT,
      ADD COLUMN IF NOT EXISTS "checked_in_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE "boats"
      ADD COLUMN IF NOT EXISTS "application_id" TEXT,
      ADD COLUMN IF NOT EXISTS "sail_number" TEXT,
      ADD COLUMN IF NOT EXISTS "display_color" TEXT,
      ADD COLUMN IF NOT EXISTS "competitor_name" TEXT
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_applications"
        ADD CONSTRAINT "FK_race_applications_boat"
        FOREIGN KEY ("boat_id") REFERENCES "boats"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "boats"
        ADD CONSTRAINT "FK_boats_application"
        FOREIGN KEY ("application_id") REFERENCES "race_applications"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      UPDATE "race_applications"
      SET "status" = 'PENDING'
      WHERE "status" IS NULL OR "status" = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "boats" DROP CONSTRAINT IF EXISTS "FK_boats_application"`);
    await queryRunner.query(`ALTER TABLE "race_applications" DROP CONSTRAINT IF EXISTS "FK_race_applications_boat"`);
    await queryRunner.query(`
      ALTER TABLE "boats"
      DROP COLUMN IF EXISTS "application_id",
      DROP COLUMN IF EXISTS "sail_number",
      DROP COLUMN IF EXISTS "display_color",
      DROP COLUMN IF EXISTS "competitor_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "race_applications"
      DROP COLUMN IF EXISTS "status",
      DROP COLUMN IF EXISTS "boat_id",
      DROP COLUMN IF EXISTS "user_id",
      DROP COLUMN IF EXISTS "checked_in_at"
    `);
  }
}
