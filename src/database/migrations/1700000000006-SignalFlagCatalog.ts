import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_SIGNAL_FLAG_CATALOG } from '../../signal-flags/signal-flags.constants';

export class SignalFlagCatalog1700000000006 implements MigrationInterface {
  name = 'SignalFlagCatalog1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "signal_flag_catalogs" (
        "id" TEXT NOT NULL DEFAULT 'default',
        "catalog" JSONB NOT NULL,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "signal_flag_catalogs_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `INSERT INTO "signal_flag_catalogs" ("id", "catalog")
       VALUES ($1, $2::jsonb)
       ON CONFLICT ("id") DO NOTHING`,
      ['default', JSON.stringify(DEFAULT_SIGNAL_FLAG_CATALOG)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "signal_flag_catalogs"`);
  }
}
