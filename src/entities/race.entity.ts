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
import { RaceStatusEnum } from '../common/constants';
import { Course } from './course.entity';
import { RaceApplication } from './race-application.entity';
import { Boat } from './boat.entity';
import { TrackPoint } from './track-point.entity';

@Entity('races')
export class Race {
  @PrimaryColumn('text')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column()
  location!: string;

  @Column({ type: 'text', nullable: true })
  venue!: string | null;

  @Column({ name: 'start_date', type: 'timestamp' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  endDate!: Date;

  @Column({ name: 'registration_deadline', type: 'timestamp' })
  registrationDeadline!: Date;

  @Column({ name: 'boat_class', type: 'text', nullable: true })
  boatClass!: string | null;

  @Column({ default: 30 })
  capacity!: number;

  @Column({ type: 'enum', enum: RaceStatusEnum, enumName: 'RaceStatus', default: RaceStatusEnum.DRAFT })
  status!: RaceStatusEnum;

  @Column({ type: 'text', nullable: true })
  organizer!: string | null;

  @Column({ name: 'course_id', type: 'text', nullable: true })
  courseId!: string | null;

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Course, (course) => course.races, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'course_id' })
  course!: Course | null;

  @OneToMany(() => RaceApplication, (app) => app.race)
  applications!: RaceApplication[];

  @OneToMany(() => Boat, (boat) => boat.race)
  boats!: Boat[];

  @OneToMany(() => TrackPoint, (tp) => tp.race)
  trackPoints!: TrackPoint[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
