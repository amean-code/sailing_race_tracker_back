import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceSuspendedStatus1700000000005 implements MigrationInterface {
  name = 'RaceSuspendedStatus1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "RaceStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
