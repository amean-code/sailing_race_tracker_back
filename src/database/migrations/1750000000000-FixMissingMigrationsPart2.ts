import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMissingMigrationsPart2175000000000 implements MigrationInterface {
  name = 'FixMissingMigrationsPart2175000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add SUPER_ADMIN and SPECTATOR roles to UserRole enum (idempotent)
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SPECTATOR';
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    // 2. Add missing 'status' column to courses table
    await queryRunner.query(`
      ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN IF EXISTS "status"`);
  }
}
