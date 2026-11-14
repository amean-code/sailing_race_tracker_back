import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceAssignmentAndTrackPointDeviceId1785900000000
  implements MigrationInterface
{
  name = 'DeviceAssignmentAndTrackPointDeviceId1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "track_points"
      ADD COLUMN IF NOT EXISTS "device_id" text
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "track_points_device_id_idx"
      ON "track_points" ("device_id")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "DeviceAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED', 'REPLACED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_assignments" (
        "id" text NOT NULL,
        "device_id" text NOT NULL,
        "boat_id" text NOT NULL,
        "race_id" text,
        "assignment_status" "DeviceAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
        "assigned_at" TIMESTAMP NOT NULL DEFAULT now(),
        "released_at" TIMESTAMP,
        "assigned_by" text,
        "released_by" text,
        "replacement_reason" text,
        CONSTRAINT "PK_device_assignments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "device_assignments_device_id_idx"
      ON "device_assignments" ("device_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "device_assignments_boat_id_idx"
      ON "device_assignments" ("boat_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "device_assignments_race_id_idx"
      ON "device_assignments" ("race_id")
    `);

    // At most one ACTIVE assignment per device / per boat.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "device_assignments_one_active_per_device"
      ON "device_assignments" ("device_id")
      WHERE "assignment_status" = 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "device_assignments_one_active_per_boat"
      ON "device_assignments" ("boat_id")
      WHERE "assignment_status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_assignments"
          ADD CONSTRAINT "FK_device_assignments_device"
          FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_assignments"
          ADD CONSTRAINT "FK_device_assignments_boat"
          FOREIGN KEY ("boat_id") REFERENCES "boats"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_assignments"
          ADD CONSTRAINT "FK_device_assignments_race"
          FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_assignments"
          ADD CONSTRAINT "FK_device_assignments_assigned_by"
          FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_assignments"
          ADD CONSTRAINT "FK_device_assignments_released_by"
          FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Backfill ACTIVE assignments from current Device.assigned_boat_id snapshot.
    await queryRunner.query(`
      INSERT INTO "device_assignments" (
        "id", "device_id", "boat_id", "race_id", "assignment_status", "assigned_at"
      )
      SELECT
        md5(random()::text || clock_timestamp()::text || d.id),
        d.id,
        d.assigned_boat_id,
        b.race_id,
        'ACTIVE',
        COALESCE(d.updated_at, now())
      FROM "devices" d
      INNER JOIN "boats" b ON b.id = d.assigned_boat_id
      WHERE d.assigned_boat_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "device_assignments" da
          WHERE da.device_id = d.id AND da.assignment_status = 'ACTIVE'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "device_assignments" DROP CONSTRAINT IF EXISTS "FK_device_assignments_released_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "device_assignments" DROP CONSTRAINT IF EXISTS "FK_device_assignments_assigned_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "device_assignments" DROP CONSTRAINT IF EXISTS "FK_device_assignments_race"
    `);
    await queryRunner.query(`
      ALTER TABLE "device_assignments" DROP CONSTRAINT IF EXISTS "FK_device_assignments_boat"
    `);
    await queryRunner.query(`
      ALTER TABLE "device_assignments" DROP CONSTRAINT IF EXISTS "FK_device_assignments_device"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "device_assignments_one_active_per_boat"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "device_assignments_one_active_per_device"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "device_assignments_race_id_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "device_assignments_boat_id_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "device_assignments_device_id_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_assignments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "DeviceAssignmentStatus"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "track_points_device_id_idx"`);
    await queryRunner.query(`
      ALTER TABLE "track_points" DROP COLUMN IF EXISTS "device_id"
    `);
  }
}
