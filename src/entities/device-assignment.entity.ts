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
import { DeviceAssignmentStatusEnum } from '../common/constants';
import { Boat } from './boat.entity';
import { Device } from './device.entity';
import { Race } from './race.entity';
import { User } from './user.entity';

@Entity('device_assignments')
@Index('device_assignments_device_id_idx', ['deviceId'])
@Index('device_assignments_boat_id_idx', ['boatId'])
@Index('device_assignments_race_id_idx', ['raceId'])
export class DeviceAssignment {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'device_id', type: 'text' })
  deviceId!: string;

  @Column({ name: 'boat_id', type: 'text' })
  boatId!: string;

  @Column({ name: 'race_id', type: 'text', nullable: true })
  raceId!: string | null;

  @Column({
    name: 'assignment_status',
    type: 'enum',
    enum: DeviceAssignmentStatusEnum,
    enumName: 'DeviceAssignmentStatus',
    default: DeviceAssignmentStatusEnum.ACTIVE,
  })
  assignmentStatus!: DeviceAssignmentStatusEnum;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt!: Date;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt!: Date | null;

  @Column({ name: 'assigned_by', type: 'text', nullable: true })
  assignedBy!: string | null;

  @Column({ name: 'released_by', type: 'text', nullable: true })
  releasedBy!: string | null;

  @Column({ name: 'replacement_reason', type: 'text', nullable: true })
  replacementReason!: string | null;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @ManyToOne(() => Boat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boat_id' })
  boat!: Boat;

  @ManyToOne(() => Race, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'race_id' })
  race!: Race | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser!: User | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'released_by' })
  releasedByUser!: User | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
