import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UserInvites1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'invite_token',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'invite_token_expires',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'invite_token');
    await queryRunner.dropColumn('users', 'invite_token_expires');
  }
}
