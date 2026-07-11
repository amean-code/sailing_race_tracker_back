import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceStateAndInProgress1700000000004 implements MigrationInterface {
  name = 'RaceStateAndInProgress1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "RaceStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS'
    `);
    await queryRunner.query(`
      ALTER TABLE "races"
      ADD COLUMN IF NOT EXISTS "race_state" JSONB NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "races" DROP COLUMN IF EXISTS "race_state"
    `);
  }
}
