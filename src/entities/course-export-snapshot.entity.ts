import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { randomBytes } from 'crypto';

@Entity('course_export_snapshots')
export class CourseExportSnapshot {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  title!: string;

  @Column({ name: 'race_title', default: '' })
  raceTitle!: string;

  @Column({ type: 'jsonb', default: [] })
  checkpoints!: Record<string, unknown>[];

  @Column({ name: 'created_by_id', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) {
      this.id = randomBytes(6).toString('hex');
    }
  }
}
