import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckpointPassCrossingCoords1785000000000 implements MigrationInterface {
  name = 'CheckpointPassCrossingCoords1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "checkpoint_passes"
      ADD COLUMN IF NOT EXISTS "cross_lat" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "cross_lng" DOUBLE PRECISION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "checkpoint_passes"
      DROP COLUMN IF EXISTS "cross_lat",
      DROP COLUMN IF EXISTS "cross_lng"
    `);
  }
}
