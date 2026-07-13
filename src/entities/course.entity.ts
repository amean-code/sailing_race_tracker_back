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
import { Boat } from './boat.entity';
import { Race } from './race.entity';
import { TrackPoint } from './track-point.entity';

@Entity('courses')
export class Course {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  name!: string;

  @Column({ type: 'jsonb', default: [] })
  checkpoints!: Record<string, unknown>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

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
