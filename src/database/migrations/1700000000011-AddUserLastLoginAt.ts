import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserLastLoginAt1700000000011 implements MigrationInterface {
  name = 'AddUserLastLoginAt1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at"`);
  }
}