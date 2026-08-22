import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrophyGroups1785300000000 implements MigrationInterface {
  name = 'TrophyGroups1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trophies" ADD COLUMN IF NOT EXISTS "max_group_count" integer
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "trophy_groups" (
        "id" text NOT NULL,
        "trophy_id" text NOT NULL,
        "name" character varying NOT NULL DEFAULT '',
        "sort_order" integer NOT NULL DEFAULT 0,
        "capacity" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trophy_groups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trophy_groups_trophy_name" UNIQUE ("trophy_id", "name"),
        CONSTRAINT "FK_trophy_groups_trophy"
          FOREIGN KEY ("trophy_id") REFERENCES "trophies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "race_applications"
        ADD COLUMN IF NOT EXISTS "group_id" text
    `);
    await queryRunner.query(`
      ALTER TABLE "race_applications"
        ADD COLUMN IF NOT EXISTS "temporary_group_assignment" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "race_applications"
          ADD CONSTRAINT "FK_race_applications_group"
          FOREIGN KEY ("group_id") REFERENCES "trophy_groups"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "race_applications" DROP CONSTRAINT IF EXISTS "FK_race_applications_group"
    `);
    await queryRunner.query(`
      ALTER TABLE "race_applications" DROP COLUMN IF EXISTS "temporary_group_assignment"
    `);
    await queryRunner.query(`
      ALTER TABLE "race_applications" DROP COLUMN IF EXISTS "group_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "trophy_groups"`);
    await queryRunner.query(`
      ALTER TABLE "trophies" DROP COLUMN IF EXISTS "max_group_count"
    `);
  }
}
