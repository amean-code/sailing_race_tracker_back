import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceApplicationResults1700000000003 implements MigrationInterface {
  name = 'RaceApplicationResults1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_applications"
      ADD COLUMN IF NOT EXISTS "finish_position" INTEGER,
      ADD COLUMN IF NOT EXISTS "fleet_size" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_applications"
      DROP COLUMN IF EXISTS "finish_position",
      DROP COLUMN IF EXISTS "fleet_size"
    `);
  }
}
