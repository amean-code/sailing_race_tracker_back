import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserStatus1700000000010 implements MigrationInterface {
  name = 'AddUserStatus1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'APPROVED'
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "status" = 'APPROVED'
      WHERE "status" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "UserStatus"`);
  }
}