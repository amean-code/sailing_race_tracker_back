import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignedCommittee1784800000000 implements MigrationInterface {
  name = 'AssignedCommittee1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "assigned_committee_id" text
    `);
    await queryRunner.query(`
      ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "assigned_committee_id" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "races" DROP COLUMN IF EXISTS "assigned_committee_id"`);
    await queryRunner.query(`ALTER TABLE "trophies" DROP COLUMN IF EXISTS "assigned_committee_id"`);
  }
}
