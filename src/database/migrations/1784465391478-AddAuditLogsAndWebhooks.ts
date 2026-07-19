import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditLogsAndWebhooks1784465391478 implements MigrationInterface {
    name = 'AddAuditLogsAndWebhooks1784465391478'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "webhook_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying NOT NULL, "events" jsonb NOT NULL DEFAULT '[]', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bf631ae77d39849d599817fb6f4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "raceId" uuid, "boatId" uuid, "userId" uuid, "eventType" character varying NOT NULL, "description" text, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e935749d9868910b0080574c29" ON "audit_logs" ("raceId", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e935749d9868910b0080574c29"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TABLE "webhook_subscriptions"`);
    }

}
