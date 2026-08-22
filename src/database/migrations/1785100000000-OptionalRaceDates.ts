import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptionalRaceDates1785100000000 implements MigrationInterface {
  name = 'OptionalRaceDates1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "start_date" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "end_date" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "registration_deadline" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "races" SET "start_date" = NOW() WHERE "start_date" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "races" SET "end_date" = NOW() WHERE "end_date" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "races" SET "registration_deadline" = NOW() WHERE "registration_deadline" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "start_date" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "end_date" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "races" ALTER COLUMN "registration_deadline" SET NOT NULL
    `);
  }
}
