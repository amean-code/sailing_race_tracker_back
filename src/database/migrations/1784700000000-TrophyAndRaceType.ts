import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrophyAndRaceType1784700000000 implements MigrationInterface {
  name = 'TrophyAndRaceType1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "TrophyStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "RaceType" AS ENUM ('REGATA', 'TROFE_LEG');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trophies" (
        "id" text NOT NULL,
        "title" character varying NOT NULL DEFAULT '',
        "description" text,
        "location" character varying NOT NULL DEFAULT '',
        "venue" text,
        "organizer" text,
        "boat_class" text,
        "status" "TrophyStatus" NOT NULL DEFAULT 'OPEN',
        "created_by_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trophies" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "type" "RaceType" NOT NULL DEFAULT 'REGATA'
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "trophy_id" text
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "leg_order" integer
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "races"
          ADD CONSTRAINT "FK_races_trophy"
          FOREIGN KEY ("trophy_id") REFERENCES "trophies"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "races" DROP CONSTRAINT IF EXISTS "FK_races_trophy"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "leg_order"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "trophy_id"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "trophies"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "RaceType"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "TrophyStatus"`);
  }
}
