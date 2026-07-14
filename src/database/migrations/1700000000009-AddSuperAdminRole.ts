import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuperAdminRole1700000000009 implements MigrationInterface {
  name = 'AddSuperAdminRole1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // This down migration is intentionally a no-op to preserve data safety.
  }
}
