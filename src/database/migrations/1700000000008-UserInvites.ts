import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UserInvites1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token" TEXT`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_expires" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "invite_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "invite_token_expires"`);
  }
}
