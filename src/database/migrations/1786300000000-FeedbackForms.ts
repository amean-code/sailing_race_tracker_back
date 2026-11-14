import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feedback campaigns (forms) + formId on responses.
 * Do not auto-run against production — apply manually in local/dev when ready.
 */
export class FeedbackForms1786300000000 implements MigrationInterface {
  name = 'FeedbackForms1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feedback_forms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(160) NOT NULL,
        "description" text NOT NULL,
        "slug" character varying(80) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedback_forms" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feedback_forms_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "feedbacks"
      ADD COLUMN IF NOT EXISTS "formId" uuid
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "feedbacks"
          ADD CONSTRAINT "FK_feedbacks_form"
          FOREIGN KEY ("formId") REFERENCES "feedback_forms"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_feedbacks_form_status_createdAt"
      ON "feedbacks" ("formId", "status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_feedbacks_form_status_createdAt"`);
    await queryRunner.query(`
      ALTER TABLE "feedbacks" DROP CONSTRAINT IF EXISTS "FK_feedbacks_form"
    `);
    await queryRunner.query(`ALTER TABLE "feedbacks" DROP COLUMN IF EXISTS "formId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feedback_forms"`);
  }
}
