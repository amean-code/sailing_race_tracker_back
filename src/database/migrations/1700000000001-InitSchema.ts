import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000001 implements MigrationInterface {
  name = 'InitSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "UserRole" AS ENUM ('SAILOR', 'COMMITTEE', 'ADMIN');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "RaceStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "name" TEXT,
        "role" "UserRole" NOT NULL DEFAULT 'SAILOR',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "courses" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "checkpoints" JSONB NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "races" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "location" TEXT NOT NULL,
        "venue" TEXT,
        "start_date" TIMESTAMP(3) NOT NULL,
        "end_date" TIMESTAMP(3) NOT NULL,
        "registration_deadline" TIMESTAMP(3) NOT NULL,
        "boat_class" TEXT,
        "capacity" INTEGER NOT NULL DEFAULT 30,
        "status" "RaceStatus" NOT NULL DEFAULT 'DRAFT',
        "organizer" TEXT,
        "course_id" TEXT,
        "created_by_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "races_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "boats" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'idle',
        "user_id" TEXT,
        "course_id" TEXT,
        "race_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "boats_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "track_points" (
        "id" TEXT NOT NULL,
        "boat_id" TEXT NOT NULL,
        "course_id" TEXT,
        "race_id" TEXT,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "heading" DOUBLE PRECISION,
        "speed" DOUBLE PRECISION,
        "accuracy" DOUBLE PRECISION,
        "client_key" TEXT,
        "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "track_points_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "race_applications" (
        "id" TEXT NOT NULL,
        "race_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "phone" TEXT,
        "boat_name" TEXT NOT NULL,
        "sail_number" TEXT NOT NULL,
        "club" TEXT,
        "notes" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "race_applications_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "race_applications_race_id_email_key"
      ON "race_applications"("race_id", "email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "track_points_boat_id_recorded_at_idx"
      ON "track_points"("boat_id", "recorded_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "race_id" TEXT
    `);
    await queryRunner.query(`
      ALTER TABLE "track_points" ADD COLUMN IF NOT EXISTS "race_id" TEXT
    `);
    await queryRunner.query(`
      ALTER TABLE "track_points" ADD COLUMN IF NOT EXISTS "accuracy" DOUBLE PRECISION
    `);
    await queryRunner.query(`
      ALTER TABLE "track_points" ADD COLUMN IF NOT EXISTS "client_key" TEXT
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "track_points_client_key_key"
      ON "track_points"("client_key") WHERE "client_key" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "boats" ADD CONSTRAINT "boats_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "boats" ADD CONSTRAINT "boats_course_id_fkey"
          FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "boats" ADD CONSTRAINT "boats_race_id_fkey"
          FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "track_points" ADD CONSTRAINT "track_points_boat_id_fkey"
          FOREIGN KEY ("boat_id") REFERENCES "boats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "track_points" ADD CONSTRAINT "track_points_course_id_fkey"
          FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "track_points" ADD CONSTRAINT "track_points_race_id_fkey"
          FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "races" ADD CONSTRAINT "races_course_id_fkey"
          FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_applications" ADD CONSTRAINT "race_applications_race_id_fkey"
          FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "race_applications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "track_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "boats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "races"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "courses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "RaceStatus"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "UserRole"`);
  }
}
