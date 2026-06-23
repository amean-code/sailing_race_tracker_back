import { BeforeInsert, Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserRoleEnum } from '../common/constants';
import { Boat } from './boat.entity';

@Entity('users')
export class User {
  @PrimaryColumn('text')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'enum', enum: UserRoleEnum, enumName: 'UserRole', default: UserRoleEnum.SAILOR })
  role!: UserRoleEnum;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

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
