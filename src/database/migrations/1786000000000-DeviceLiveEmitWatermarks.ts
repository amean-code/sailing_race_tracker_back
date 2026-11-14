import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persistent device live-emit watermarks (OOO gate).
 * Do not auto-run against production — apply manually in local/dev when ready.
 */
export class DeviceLiveEmitWatermarks1786000000000 implements MigrationInterface {
  name = 'DeviceLiveEmitWatermarks1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_live_emit_watermarks" (
        "boat_id" text NOT NULL,
        "last_emitted_recorded_at" TIMESTAMP NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_live_emit_watermarks" PRIMARY KEY ("boat_id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "device_live_emit_watermarks"
          ADD CONSTRAINT "FK_device_live_emit_watermarks_boat"
          FOREIGN KEY ("boat_id") REFERENCES "boats"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "device_live_emit_watermarks"
      DROP CONSTRAINT IF EXISTS "FK_device_live_emit_watermarks_boat"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_live_emit_watermarks"`);
  }
}
