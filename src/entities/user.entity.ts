import { BeforeInsert, Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserRoleEnum, UserStatusEnum } from '../common/constants';
import { Boat } from './boat.entity';

@Entity('users')
export class User {
  @PrimaryColumn('text')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', default: '' })
  passwordHash!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'enum', enum: UserRoleEnum, enumName: 'UserRole', default: UserRoleEnum.SAILOR })
  role!: UserRoleEnum;

  @Column({ type: 'enum', enum: UserStatusEnum, enumName: 'UserStatus', default: UserStatusEnum.APPROVED })
  status!: UserStatusEnum;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'invite_token', type: 'text', nullable: true })
  inviteToken!: string | null;

  @Column({ name: 'invite_token_expires', type: 'timestamp', nullable: true })
  inviteTokenExpires!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Boat, (boat) => boat.user)
  boats!: Boat[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
