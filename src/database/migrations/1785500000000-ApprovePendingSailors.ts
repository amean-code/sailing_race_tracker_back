import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApprovePendingSailors1785500000000 implements MigrationInterface {
  name = 'ApprovePendingSailors1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "status" = 'APPROVED'
      WHERE "role" = 'SAILOR' AND "status" = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irreversible: cannot distinguish previously-pending sailors from always-approved ones
  }
}
