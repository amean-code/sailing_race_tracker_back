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
import { RaceStatusEnum, RaceTypeEnum } from '../common/constants';
import { Course } from './course.entity';
import { Boat } from './boat.entity';
import { TrackPoint } from './track-point.entity';
import { Leg } from './leg.entity';
import { RaceResult } from './race-result.entity';

@Entity('races')
export class Race {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'start_date', type: 'timestamp', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'timestamp', nullable: true })
  endDate!: Date | null;

  @Column({
    type: 'enum',
    enum: RaceStatusEnum,
    enumName: 'RaceStatus',
    default: RaceStatusEnum.OPEN,
  })
  status!: RaceStatusEnum;

  @Column({ name: 'leg_id', type: 'text', nullable: true })
  legId!: string | null;

  @Column({ name: 'race_order', type: 'int', nullable: true })
  raceOrder!: number | null;

  @Column({ name: 'course_id', type: 'text', nullable: true })
  courseId!: string | null;

  @Column({ name: 'course_ids', type: 'jsonb', default: [] })
  courseIds!: string[];

  @Column({ name: 'race_state', type: 'jsonb', default: {} })
  raceState!: Record<string, unknown>;

  @Column({ name: 'course_snapshot', type: 'jsonb', nullable: true })
  courseSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  /**
   * Legacy columns kept so synchronize does not drop them before bootstrap
   * migrates existing rows into legs. New code must not write these.
   */
  @Column({ type: 'varchar', default: '', nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  venue!: string | null;

  @Column({ type: 'text', nullable: true })
  organizer!: string | null;

  @Column({ name: 'boat_class', type: 'text', nullable: true })
  boatClass!: string | null;

  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'registration_deadline', type: 'timestamp', nullable: true })
  registrationDeadline!: Date | null;

  @Column({ name: 'assigned_committee_id', type: 'text', nullable: true })
  assignedCommitteeId!: string | null;

  @Column({
    type: 'enum',
    enum: RaceTypeEnum,
    enumName: 'RaceType',
    nullable: true,
  })
  type!: RaceTypeEnum | null;

  @Column({ name: 'trophy_id', type: 'text', nullable: true })
  trophyId!: string | null;

  @Column({ name: 'leg_order', type: 'int', nullable: true })
  legOrder!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Course, (course) => course.races, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'course_id' })
  course!: Course | null;

  @ManyToOne(() => Leg, (leg) => leg.races, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leg_id' })
  leg!: Leg | null;

  @OneToMany(() => Boat, (boat) => boat.race)
  boats!: Boat[];

  @OneToMany(() => TrackPoint, (tp) => tp.race)
  trackPoints!: TrackPoint[];

  @OneToMany(() => RaceResult, (result) => result.race)
  results!: RaceResult[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
