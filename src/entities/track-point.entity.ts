import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Boat } from './boat.entity';
import { Course } from './course.entity';
import { Race } from './race.entity';

@Entity('track_points')
@Index(['boatId', 'recordedAt'])
@Index('track_points_race_id_boat_id_recorded_at_idx', ['raceId', 'boatId', 'recordedAt'])
export class TrackPoint {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'boat_id' })
  boatId!: string;

  @Column({ name: 'course_id', type: 'text', nullable: true })
  courseId!: string | null;

  @Column({ name: 'race_id', type: 'text', nullable: true })
  raceId!: string | null;

  @Column('double precision')
  lat!: number;

  @Column('double precision')
  lng!: number;

  @Column('double precision', { nullable: true })
  heading!: number | null;

  @Column('double precision', { nullable: true })
  speed!: number | null;

  @Column('double precision', { nullable: true })
  accuracy!: number | null;

  @Column({ name: 'client_key', type: 'text', nullable: true, unique: true })
  clientKey!: string | null;

  /** 'pwa' | 'device' — null for legacy rows written before provenance existed. */
  @Column({ type: 'text', nullable: true })
  source!: string | null;

  /** Source IoT device when source=device; null for PWA / legacy rows. */
  @Index('track_points_device_id_idx')
  @Column({ name: 'device_id', type: 'text', nullable: true })
  deviceId!: string | null;

  @Column({ name: 'recorded_at', type: 'timestamp' })
  recordedAt!: Date;

  @ManyToOne(() => Boat, (boat) => boat.trackPoints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boat_id' })
  boat!: Boat;

  @ManyToOne(() => Course, (course) => course.trackPoints, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'course_id' })
  course!: Course | null;

  @ManyToOne(() => Race, (race) => race.trackPoints, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'race_id' })
  race!: Race | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
