import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Trophy } from './trophy.entity';
import { RaceApplication } from './race-application.entity';

@Entity('trophy_groups')
@Unique(['trophyId', 'name'])
export class TrophyGroup {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'trophy_id', type: 'text' })
  trophyId!: string;

  @Column({ default: '' })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  /** null = unlimited */
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Trophy, (trophy) => trophy.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trophy_id' })
  trophy!: Trophy;

  @OneToMany(() => RaceApplication, (app) => app.group)
  applications!: RaceApplication[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
