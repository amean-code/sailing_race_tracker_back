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
import { User } from './user.entity';
import { Course } from './course.entity';
import { Race } from './race.entity';
import { TrackPoint } from './track-point.entity';

@Entity('boats')
export class Boat {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  name!: string;

  @Column({ default: 'idle' })
  status!: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId!: string | null;

  @Column({ name: 'course_id', type: 'text', nullable: true })
  courseId!: string | null;

  @Column({ name: 'race_id', type: 'text', nullable: true })
  raceId!: string | null;

  @Column({ name: 'application_id', type: 'text', nullable: true })
  applicationId!: string | null;

  @Column({ name: 'sail_number', type: 'text', nullable: true })
  sailNumber!: string | null;

  @Column({ name: 'display_color', type: 'text', nullable: true })
  displayColor!: string | null;

  @Column({ name: 'competitor_name', type: 'text', nullable: true })
  competitorName!: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  club!: string | null;

  @Column({ name: 'boat_class', type: 'text', nullable: true })
  boatClass!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  length!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  width!: number | null;

  @Column({ type: 'text', nullable: true })
  color!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.boats, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ManyToOne(() => Course, (course) => course.boats, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'course_id' })
  course!: Course | null;

  @ManyToOne(() => Race, (race) => race.boats, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'race_id' })
  race!: Race | null;

  @OneToMany(() => TrackPoint, (tp) => tp.boat)
  trackPoints!: TrackPoint[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
