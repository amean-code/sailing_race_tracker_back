import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Boat } from './boat.entity';

/**
 * Persistent last-emitted device GPS timestamp per boat.
 * Advanced only when gps.received is scheduled for a device TrackPoint
 * (not on prefer_phone / stale / ooo persist-only skips).
 */
@Entity('device_live_emit_watermarks')
export class DeviceLiveEmitWatermark {
  @PrimaryColumn({ name: 'boat_id', type: 'text' })
  boatId!: string;

  @Column({ name: 'last_emitted_recorded_at', type: 'timestamp' })
  lastEmittedRecordedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @ManyToOne(() => Boat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boat_id' })
  boat!: Boat;
}
