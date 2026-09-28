import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailPreferences1784548764378 implements MigrationInterface {
  name = 'AddEmailPreferences1784548764378';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent: columns may already exist from synchronize:true
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receive_emails" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "unsubscribe_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "receive_emails"`);
  }
}
