import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameRaceStatusClosedToFinished1730000000000 implements MigrationInterface {
  name = 'RenameRaceStatusClosedToFinished1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename the enum value CLOSED to FINISHED in PostgreSQL.
    // NOTE: RENAME VALUE is supported in PostgreSQL 10+ and cannot be executed inside a transaction block in older versions.
    const checkEnum = await queryRunner.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'RaceStatus' AND pg_enum.enumlabel = 'CLOSED'
    `);

    if (checkEnum.length > 0) {
      await queryRunner.query(`ALTER TYPE "RaceStatus" RENAME VALUE 'CLOSED' TO 'FINISHED';`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const checkEnum = await queryRunner.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'RaceStatus' AND pg_enum.enumlabel = 'FINISHED'
    `);

    if (checkEnum.length > 0) {
      await queryRunner.query(`ALTER TYPE "RaceStatus" RENAME VALUE 'FINISHED' TO 'CLOSED';`);
    }
  }
}
