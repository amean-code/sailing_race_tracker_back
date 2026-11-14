import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public feedback inbox table.
 * Do not auto-run against production — apply manually in local/dev when ready.
 */
export class Feedback1786200000000 implements MigrationInterface {
  name = 'Feedback1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feedbacks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "issue" text NOT NULL,
        "suggestion" text,
        "status" character varying(16) NOT NULL DEFAULT 'new',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedbacks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_feedbacks_status_createdAt"
      ON "feedbacks" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_feedbacks_status_createdAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feedbacks"`);
  }
}
