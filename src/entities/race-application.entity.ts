import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationStatusEnum, PaymentStatusEnum } from '../common/constants';
import { Leg } from './leg.entity';
import { Boat } from './boat.entity';
import { User } from './user.entity';
import { RaceResult } from './race-result.entity';
import { TrophyGroup } from './trophy-group.entity';

@Entity('race_applications')
@Unique(['legId', 'email'])
export class RaceApplication {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'leg_id', type: 'text', nullable: true })
  legId!: string | null;

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

  @Column({ name: 'group_id', type: 'text', nullable: true })
  groupId!: string | null;

  @Column({ name: 'temporary_group_assignment', type: 'boolean', default: false })
  temporaryGroupAssignment!: boolean;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId!: string | null;

  @Column({ name: 'checked_in_at', type: 'timestamp', nullable: true })
  checkedInAt!: Date | null;

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

  @ManyToOne(() => Leg, (leg) => leg.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leg_id' })
  leg!: Leg;

  @ManyToOne(() => Boat, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'boat_id' })
  boat!: Boat | null;

  @ManyToOne(() => TrophyGroup, (group) => group.applications, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group!: TrophyGroup | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @OneToMany(() => RaceResult, (result) => result.application)
  results!: RaceResult[];

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
