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
import { Boat } from './boat.entity';
import { Race } from './race.entity';
import { TrackPoint } from './track-point.entity';
import { User } from './user.entity';
import { CourseStatusEnum } from '../common/constants';

@Entity('courses')
export class Course {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  name!: string;

  @Column({ type: 'jsonb', default: [] })
  checkpoints!: Record<string, unknown>[];

  @Column({ type: 'text', default: CourseStatusEnum.DRAFT })
  status!: CourseStatusEnum;

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @OneToMany(() => Boat, (boat) => boat.course)
  boats!: Boat[];

  @OneToMany(() => TrackPoint, (tp) => tp.course)
  trackPoints!: TrackPoint[];

  @OneToMany(() => Race, (race) => race.course)
  races!: Race[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
