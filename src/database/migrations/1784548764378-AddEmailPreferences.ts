import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailPreferences1784548764378 implements MigrationInterface {
    name = 'AddEmailPreferences1784548764378'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "receive_emails" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "users" ADD "unsubscribe_token" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "unsubscribe_token"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "receive_emails"`);
    }

}
