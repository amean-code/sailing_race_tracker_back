import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrophyDatesAndPlannedLegs1784900000000 implements MigrationInterface {
  name = 'TrophyDatesAndPlannedLegs1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "planned_leg_count" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trophies" DROP COLUMN IF EXISTS "planned_leg_count"`);
    await queryRunner.query(`ALTER TABLE "trophies" DROP COLUMN IF EXISTS "end_date"`);
    await queryRunner.query(`ALTER TABLE "trophies" DROP COLUMN IF EXISTS "start_date"`);
  }
}
