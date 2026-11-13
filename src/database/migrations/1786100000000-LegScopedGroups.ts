import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegScopedGroups1786100000000 implements MigrationInterface {
  name = 'LegScopedGroups1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trophy_groups"
        ALTER COLUMN "trophy_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "trophy_groups"
        ADD COLUMN IF NOT EXISTS "leg_id" text
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "trophy_groups"
          ADD CONSTRAINT "FK_trophy_groups_leg"
          FOREIGN KEY ("leg_id") REFERENCES "legs"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "trophy_groups"
          ADD CONSTRAINT "UQ_trophy_groups_leg_name"
          UNIQUE ("leg_id", "name");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "trophy_groups"
          ADD CONSTRAINT "CHK_trophy_groups_owner"
          CHECK (
            ("trophy_id" IS NOT NULL AND "leg_id" IS NULL)
            OR ("trophy_id" IS NULL AND "leg_id" IS NOT NULL)
          );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_trophy_groups_leg_id"
        ON "trophy_groups" ("leg_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_trophy_groups_leg_id"`);
    await queryRunner.query(`
      ALTER TABLE "trophy_groups" DROP CONSTRAINT IF EXISTS "CHK_trophy_groups_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "trophy_groups" DROP CONSTRAINT IF EXISTS "UQ_trophy_groups_leg_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "trophy_groups" DROP CONSTRAINT IF EXISTS "FK_trophy_groups_leg"
    `);
    await queryRunner.query(`
      DELETE FROM "trophy_groups" WHERE "trophy_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "trophy_groups" DROP COLUMN IF EXISTS "leg_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "trophy_groups"
        ALTER COLUMN "trophy_id" SET NOT NULL
    `);
  }
}
