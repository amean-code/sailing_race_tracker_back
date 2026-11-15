import { MigrationInterface, QueryRunner } from 'typeorm';

export class CourseExportSnapshots1786400000000 implements MigrationInterface {
  name = 'CourseExportSnapshots1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "course_export_snapshots" (
        "id" text NOT NULL,
        "title" character varying NOT NULL DEFAULT '',
        "race_title" character varying NOT NULL DEFAULT '',
        "checkpoints" jsonb NOT NULL DEFAULT '[]',
        "created_by_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_export_snapshots" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "course_export_snapshots"`);
  }
}
