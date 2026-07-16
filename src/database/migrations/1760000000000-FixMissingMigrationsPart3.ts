import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMissingMigrationsPart3176000000000 implements MigrationInterface {
  name = 'FixMissingMigrationsPart3176000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add missing created_by_id to courses
    await queryRunner.query(`ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT`);
    
    // Add FK conditionally
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_id_fkey"
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Add missing fields to boats
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "photo_url" TEXT`);
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "club" TEXT`);
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "boat_class" TEXT`);
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "length" DECIMAL(5,2)`);
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "width" DECIMAL(5,2)`);
    await queryRunner.query(`ALTER TABLE "boats" ADD COLUMN IF NOT EXISTS "color" TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "color"`);
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "width"`);
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "length"`);
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "boat_class"`);
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "club"`);
    await queryRunner.query(`ALTER TABLE "boats" DROP COLUMN IF EXISTS "photo_url"`);

    await queryRunner.query(`ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_created_by_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "courses" DROP COLUMN IF EXISTS "created_by_id"`);
  }
}
