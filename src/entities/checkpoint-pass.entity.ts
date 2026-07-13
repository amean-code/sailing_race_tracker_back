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
import { Race } from './race.entity';
import { RaceApplication } from './race-application.entity';

@Entity('checkpoint_passes')
@Index(['raceId', 'checkpointIndex'])
@Index(['raceId', 'applicationId'])
export class CheckpointPass {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'race_id' })
  raceId!: string;

  @Column({ name: 'application_id' })
  applicationId!: string;

  /** 0 = start line, 1 = first buoy, etc. */
  @Column({ name: 'checkpoint_index', type: 'int' })
  checkpointIndex!: number;

  @Column({ name: 'checkpoint_id', type: 'text' })
  checkpointId!: string;

  /** UTC timestamp when the boat crossed this checkpoint */
  @Column({ name: 'passed_at', type: 'timestamp' })
  passedAt!: Date;

  /** Seconds elapsed since race start (startedAt) */
  @Column({ name: 'elapsed_seconds', type: 'double precision', nullable: true })
  elapsedSeconds!: number | null;

  /** Rank at this checkpoint (1-based, computed at record time) */
  @Column({ name: 'rank', type: 'int', nullable: true })
  rank!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Race, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'race_id' })
  race!: Race;

  @ManyToOne(() => RaceApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: RaceApplication;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
