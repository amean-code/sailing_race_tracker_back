import { MigrationInterface, QueryRunner } from 'typeorm';

export class RaceCancelledStatus1700000000008 implements MigrationInterface {
  name = 'RaceCancelledStatus1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "RaceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
