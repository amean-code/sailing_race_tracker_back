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
import { Leg } from './leg.entity';
import { RaceApplication } from './race-application.entity';

/**
 * Fleet grouping for competitors.
 * Owned by either a trophy (trophyId) or a standalone leg/regatta/single (legId).
 */
@Entity('trophy_groups')
@Unique(['trophyId', 'name'])
@Unique(['legId', 'name'])
export class TrophyGroup {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'trophy_id', type: 'text', nullable: true })
  trophyId!: string | null;

  @Column({ name: 'leg_id', type: 'text', nullable: true })
  legId!: string | null;

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

  @ManyToOne(() => Trophy, (trophy) => trophy.groups, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'trophy_id' })
  trophy!: Trophy | null;

  @ManyToOne(() => Leg, (leg) => leg.groups, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'leg_id' })
  leg!: Leg | null;

  @OneToMany(() => RaceApplication, (app) => app.group)
  applications!: RaceApplication[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
