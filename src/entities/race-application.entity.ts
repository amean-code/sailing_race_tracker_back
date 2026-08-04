import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationStatusEnum, PaymentStatusEnum } from '../common/constants';
import { Race } from './race.entity';
import { Boat } from './boat.entity';
import { User } from './user.entity';

@Entity('race_applications')
@Unique(['raceId', 'email'])
export class RaceApplication {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'race_id' })
  raceId!: string;

  @Column({ default: '' })
  name!: string;

  @Column({ default: '' })
  email!: string;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'boat_name', default: '' })
  boatName!: string;

  @Column({ name: 'sail_number', default: '' })
  sailNumber!: string;

  @Column({ type: 'text', nullable: true })
  club!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', default: ApplicationStatusEnum.PENDING })
  status!: ApplicationStatusEnum | string;

  @Column({ name: 'boat_id', type: 'text', nullable: true })
  boatId!: string | null;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId!: string | null;

  @Column({ name: 'checked_in_at', type: 'timestamp', nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: 'finish_position', type: 'int', nullable: true })
  finishPosition!: number | null;

  @Column({ name: 'fleet_size', type: 'int', nullable: true })
  fleetSize!: number | null;

  @Column({ name: 'crew_members', type: 'jsonb', nullable: true })
  crewMembers!: string[] | null;

  @Column({
    name: 'payment_status',
    type: 'text',
    default: PaymentStatusEnum.NONE,
  })
  paymentStatus!: PaymentStatusEnum | string;

  @Column({ name: 'payment_receipt_path', type: 'text', nullable: true })
  paymentReceiptPath!: string | null;

  @Column({ name: 'payment_receipt_file_name', type: 'text', nullable: true })
  paymentReceiptFileName!: string | null;

  @Column({ name: 'payment_note', type: 'text', nullable: true })
  paymentNote!: string | null;

  @Column({ name: 'payment_reviewed_at', type: 'timestamp', nullable: true })
  paymentReviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Race, (race) => race.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'race_id' })
  race!: Race;

  @ManyToOne(() => Boat, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'boat_id' })
  boat!: Boat | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
