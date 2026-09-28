import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DeviceStatusEnum } from '../common/constants';
import { Boat } from './boat.entity';

@Entity('devices')
export class Device {
  @PrimaryColumn('text')
  id!: string;

  @Column({ default: '' })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'hardware_id', type: 'text' })
  hardwareId!: string;

  @Index({ unique: true })
  @Column({ name: 'api_key_prefix', type: 'text' })
  apiKeyPrefix!: string;

  @Column({ name: 'api_key_hash', type: 'text' })
  apiKeyHash!: string;

  @Column({
    type: 'enum',
    enum: DeviceStatusEnum,
    enumName: 'DeviceStatus',
    default: DeviceStatusEnum.ACTIVE,
  })
  status!: DeviceStatusEnum;

  @Index()
  @Column({ name: 'assigned_boat_id', type: 'text', nullable: true })
  assignedBoatId!: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'last_lat', type: 'double precision', nullable: true })
  lastLat!: number | null;

  @Column({ name: 'last_lng', type: 'double precision', nullable: true })
  lastLng!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Boat, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_boat_id' })
  assignedBoat!: Boat | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
