import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPhotoUrl1740000000000 implements MigrationInterface {
  name = 'AddUserPhotoUrl1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_url" TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "photo_url"`);
  }
}
