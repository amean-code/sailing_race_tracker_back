import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces legs + race_results, migrates existing races into leg containers,
 * and moves applications from race_id to leg_id.
 */
export class LegAndRaceHierarchy1785200000000 implements MigrationInterface {
  name = 'LegAndRaceHierarchy1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "LegKind" AS ENUM ('TROFE_LEG', 'REGATA', 'SINGLE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "legs" (
        "id" text NOT NULL,
        "title" character varying NOT NULL DEFAULT '',
        "description" text,
        "location" character varying NOT NULL DEFAULT '',
        "venue" text,
        "organizer" text,
        "boat_class" text,
        "kind" "LegKind" NOT NULL DEFAULT 'REGATA',
        "status" "RaceStatus" NOT NULL DEFAULT 'OPEN',
        "start_date" TIMESTAMP,
        "end_date" TIMESTAMP,
        "registration_deadline" TIMESTAMP,
        "capacity" integer NOT NULL DEFAULT 30,
        "assigned_committee_id" text,
        "trophy_id" text,
        "leg_order" integer,
        "created_by_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "legs"
          ADD CONSTRAINT "FK_legs_trophy"
          FOREIGN KEY ("trophy_id") REFERENCES "trophies"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "leg_id" text
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "race_order" integer
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "race_results" (
        "id" text NOT NULL,
        "application_id" text NOT NULL,
        "race_id" text NOT NULL,
        "finish_position" integer,
        "status" text NOT NULL DEFAULT 'PENDING',
        "fleet_size" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_race_results" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_race_results_app_race" UNIQUE ("application_id", "race_id")
      )
    `);

    // Migrate each existing race into a leg (if not already linked)
    await queryRunner.query(`
      INSERT INTO "legs" (
        "id", "title", "description", "location", "venue", "organizer", "boat_class",
        "kind", "status", "start_date", "end_date", "registration_deadline", "capacity",
        "assigned_committee_id", "trophy_id", "leg_order", "created_by_id", "created_at", "updated_at"
      )
      SELECT
        r."id" || '-leg',
        r."title",
        r."description",
        COALESCE(r."location", ''),
        r."venue",
        r."organizer",
        r."boat_class",
        CASE
          WHEN r."type"::text = 'TROFE_LEG' THEN 'TROFE_LEG'::"LegKind"
          ELSE 'REGATA'::"LegKind"
        END,
        r."status",
        r."start_date",
        r."end_date",
        r."registration_deadline",
        COALESCE(r."capacity", 30),
        r."assigned_committee_id",
        r."trophy_id",
        r."leg_order",
        r."created_by_id",
        r."created_at",
        r."updated_at"
      FROM "races" r
      WHERE r."leg_id" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "legs" l WHERE l."id" = r."id" || '-leg')
    `);

    await queryRunner.query(`
      UPDATE "races" r
      SET "leg_id" = r."id" || '-leg', "race_order" = 1
      WHERE r."leg_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "race_applications" ADD COLUMN IF NOT EXISTS "leg_id" text
    `);

    await queryRunner.query(`
      UPDATE "race_applications" a
      SET "leg_id" = r."leg_id"
      FROM "races" r
      WHERE a."race_id" = r."id" AND a."leg_id" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "race_results" ("id", "application_id", "race_id", "finish_position", "status", "fleet_size", "created_at", "updated_at")
      SELECT
        a."id" || '-result',
        a."id",
        a."race_id",
        a."finish_position",
        CASE
          WHEN a."status" IN ('DNS', 'DNF', 'DSQ') THEN a."status"
          WHEN a."finish_position" IS NOT NULL THEN 'FINISHED'
          ELSE 'PENDING'
        END,
        a."fleet_size",
        now(),
        now()
      FROM "race_applications" a
      WHERE a."race_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "race_results" rr
          WHERE rr."application_id" = a."id" AND rr."race_id" = a."race_id"
        )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "races"
          ADD CONSTRAINT "FK_races_leg"
          FOREIGN KEY ("leg_id") REFERENCES "legs"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_applications"
          ADD CONSTRAINT "FK_race_applications_leg"
          FOREIGN KEY ("leg_id") REFERENCES "legs"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_results"
          ADD CONSTRAINT "FK_race_results_application"
          FOREIGN KEY ("application_id") REFERENCES "race_applications"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_results"
          ADD CONSTRAINT "FK_race_results_race"
          FOREIGN KEY ("race_id") REFERENCES "races"("id")
          ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Drop legacy race/application columns when present
    await queryRunner.query(`ALTER TABLE "races" DROP CONSTRAINT IF EXISTS "FK_races_trophy"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "trophy_id"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "leg_order"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "location"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "venue"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "organizer"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "boat_class"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "capacity"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "registration_deadline"`);
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "assigned_committee_id"`);

    await queryRunner.query(`
      ALTER TABLE "race_applications" DROP CONSTRAINT IF EXISTS "UQ_race_applications_race_id_email"
    `);
    await queryRunner.query(`
      ALTER TABLE "race_applications" DROP CONSTRAINT IF EXISTS "FK_race_applications_race"
    `);
    // Drop unique on (race_id, email) if named differently
    await queryRunner.query(`
      DO $$ DECLARE r record;
      BEGIN
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'race_applications' AND c.contype = 'u'
        LOOP
          EXECUTE 'ALTER TABLE race_applications DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "race_applications" DROP COLUMN IF EXISTS "race_id"`);
    await queryRunner.query(`ALTER TABLE "race_applications" DROP COLUMN IF EXISTS "finish_position"`);
    await queryRunner.query(`ALTER TABLE "race_applications" DROP COLUMN IF EXISTS "fleet_size"`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_applications"
          ADD CONSTRAINT "UQ_race_applications_leg_email" UNIQUE ("leg_id", "email");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive reverse is complex; leave schema as-is for down.
    await queryRunner.query(`SELECT 1`);
  }
}
