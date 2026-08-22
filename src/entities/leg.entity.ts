import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LegKindEnum, RaceStatusEnum } from '../common/constants';
import { Trophy } from './trophy.entity';
import { Race } from './race.entity';
import { RaceApplication } from './race-application.entity';

@Entity('legs')
export class Leg {
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
    enum: LegKindEnum,
    enumName: 'LegKind',
    default: LegKindEnum.REGATA,
  })
  kind!: LegKindEnum;

  @Column({
    type: 'enum',
    enum: RaceStatusEnum,
    enumName: 'RaceStatus',
    default: RaceStatusEnum.OPEN,
  })
  status!: RaceStatusEnum;

  @Column({ name: 'start_date', type: 'timestamp', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'timestamp', nullable: true })
  endDate!: Date | null;

  @Column({ name: 'registration_deadline', type: 'timestamp', nullable: true })
  registrationDeadline!: Date | null;

  @Column({ default: 30 })
  capacity!: number;

  @Column({ name: 'assigned_committee_id', type: 'text', nullable: true })
  assignedCommitteeId!: string | null;

  @Column({ name: 'trophy_id', type: 'text', nullable: true })
  trophyId!: string | null;

  @Column({ name: 'leg_order', type: 'int', nullable: true })
  legOrder!: number | null;

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Trophy, (trophy) => trophy.legs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'trophy_id' })
  trophy!: Trophy | null;

  @OneToMany(() => Race, (race) => race.leg)
  races!: Race[];

  @OneToMany(() => RaceApplication, (app) => app.leg)
  applications!: RaceApplication[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
