import { MigrationInterface, QueryRunner } from 'typeorm';

export class Devices1785700000000 implements MigrationInterface {
  name = 'Devices1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "devices" (
        "id" text NOT NULL,
        "name" character varying NOT NULL DEFAULT '',
        "hardware_id" text NOT NULL,
        "api_key_prefix" text NOT NULL,
        "api_key_hash" text NOT NULL,
        "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
        "assigned_boat_id" text,
        "last_seen_at" TIMESTAMP,
        "last_lat" double precision,
        "last_lng" double precision,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_devices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_devices_hardware_id" UNIQUE ("hardware_id"),
        CONSTRAINT "UQ_devices_api_key_prefix" UNIQUE ("api_key_prefix")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_devices_assigned_boat_id"
      ON "devices" ("assigned_boat_id")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "devices"
          ADD CONSTRAINT "FK_devices_assigned_boat"
          FOREIGN KEY ("assigned_boat_id") REFERENCES "boats"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "FK_devices_assigned_boat"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_devices_assigned_boat_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "DeviceStatus"`);
  }
}
