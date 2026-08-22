import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TrophyStatusEnum } from '../common/constants';
import { Leg } from './leg.entity';
import { TrophyGroup } from './trophy-group.entity';

@Entity('trophies')
export class Trophy {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ default: '' })
  location!: string;

  @Column({ type: 'text', nullable: true })
  venue!: string | null;

  @Column({ type: 'text', nullable: true })
  organizer!: string | null;

  @Column({ name: 'boat_class', type: 'text', nullable: true })
  boatClass!: string | null;

  @Column({
    type: 'enum',
    enum: TrophyStatusEnum,
    enumName: 'TrophyStatus',
    default: TrophyStatusEnum.OPEN,
  })
  status!: TrophyStatusEnum;

  @Column({ name: 'start_date', type: 'timestamp', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'timestamp', nullable: true })
  endDate!: Date | null;

  @Column({ name: 'planned_leg_count', type: 'int', nullable: true })
  plannedLegCount!: number | null;

  /** Max number of boat groups that can be created for this trophy */
  @Column({ name: 'max_group_count', type: 'int', nullable: true })
  maxGroupCount!: number | null;

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  /** @deprecated Hakem ataması ayak (Leg) seviyesinde yapılır */
  @Column({ name: 'assigned_committee_id', type: 'text', nullable: true })
  assignedCommitteeId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Leg, (leg) => leg.trophy)
  legs!: Leg[];

  @OneToMany(() => TrophyGroup, (group) => group.trophy)
  groups!: TrophyGroup[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
