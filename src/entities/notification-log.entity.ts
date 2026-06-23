import { BeforeInsert, Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationAudienceEnum,
  NotificationEventEnum,
} from '../common/constants';

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'enum', enum: NotificationEventEnum, enumName: 'NotificationEvent' })
  event!: NotificationEventEnum;

  @Column({ type: 'enum', enum: NotificationAudienceEnum, enumName: 'NotificationAudience' })
  audience!: NotificationAudienceEnum;

  @Column({ type: 'text' })
  channel!: 'EMAIL' | 'WHATSAPP';

  @Column({ type: 'text' })
  recipient!: string;

  @Column({ type: 'text', default: 'PENDING' })
  status!: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

  @Column({ type: 'text', nullable: true })
  subject!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
