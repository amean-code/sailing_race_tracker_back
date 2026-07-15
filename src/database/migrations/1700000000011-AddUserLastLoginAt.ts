import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserLastLoginAt1700000000011 implements MigrationInterface {
  name = 'AddUserLastLoginAt1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'last_login_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'last_login_at');
  }
}