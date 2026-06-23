import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1700000000002 implements MigrationInterface {
  name = 'Notifications1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "NotificationEvent" AS ENUM (
          'RACE_CREATED', 'RACE_UPDATED', 'RACE_DELETED',
          'RACE_STATUS_CHANGED', 'APPLICATION_SUBMITTED', 'USER_REGISTERED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "NotificationAudience" AS ENUM (
          'APPLICANT', 'SAILOR', 'COMMITTEE', 'ADMIN'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_integrations" (
        "id" TEXT NOT NULL DEFAULT 'default',
        "smtp_enabled" BOOLEAN NOT NULL DEFAULT false,
        "smtp_host" TEXT,
        "smtp_port" INTEGER NOT NULL DEFAULT 587,
        "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
        "smtp_user" TEXT,
        "smtp_pass" TEXT,
        "smtp_from" TEXT,
        "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
        "evolution_api_url" TEXT,
        "evolution_api_key" TEXT,
        "evolution_instance" TEXT,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notification_integrations_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_rules" (
        "id" TEXT NOT NULL,
        "event" "NotificationEvent" NOT NULL,
        "audience" "NotificationAudience" NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "email_enabled" BOOLEAN NOT NULL DEFAULT false,
        "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "notification_rules_event_audience_key" UNIQUE ("event", "audience")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_logs" (
        "id" TEXT NOT NULL,
        "event" "NotificationEvent" NOT NULL,
        "audience" "NotificationAudience" NOT NULL,
        "channel" TEXT NOT NULL,
        "recipient" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "subject" TEXT,
        "error" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT
    `);

    await queryRunner.query(`
      INSERT INTO "notification_integrations" ("id") VALUES ('default')
      ON CONFLICT ("id") DO NOTHING
    `);

    const defaultRules = [
      ['APPLICATION_SUBMITTED', 'APPLICANT', true, true, false],
      ['APPLICATION_SUBMITTED', 'COMMITTEE', true, true, false],
      ['APPLICATION_SUBMITTED', 'ADMIN', true, true, false],
      ['RACE_CREATED', 'SAILOR', true, true, false],
      ['RACE_CREATED', 'COMMITTEE', true, true, false],
      ['RACE_CREATED', 'ADMIN', true, true, false],
      ['RACE_STATUS_CHANGED', 'SAILOR', true, true, false],
      ['RACE_STATUS_CHANGED', 'COMMITTEE', true, true, false],
      ['RACE_UPDATED', 'SAILOR', false, true, false],
      ['RACE_DELETED', 'COMMITTEE', true, true, false],
      ['RACE_DELETED', 'ADMIN', true, true, false],
      ['USER_REGISTERED', 'ADMIN', true, true, false],
    ];

    for (const [event, audience, enabled, email, whatsapp] of defaultRules) {
      await queryRunner.query(
        `INSERT INTO "notification_rules" ("id", "event", "audience", "enabled", "email_enabled", "whatsapp_enabled")
         SELECT md5($1 || $2 || random()::text)::text, $1::"NotificationEvent", $2::"NotificationAudience", $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM "notification_rules" WHERE "event" = $1::"NotificationEvent" AND "audience" = $2::"NotificationAudience"
         )`,
        [event, audience, enabled, email, whatsapp],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_integrations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "NotificationAudience"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "NotificationEvent"`);
  }
}
