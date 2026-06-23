import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationAudienceEnum,
  NotificationEventEnum,
} from '../common/constants';

@Entity('notification_rules')
@Unique(['event', 'audience'])
export class NotificationRule {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'enum', enum: NotificationEventEnum, enumName: 'NotificationEvent' })
  event!: NotificationEventEnum;

  @Column({ type: 'enum', enum: NotificationAudienceEnum, enumName: 'NotificationAudience' })
  audience!: NotificationAudienceEnum;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ name: 'email_enabled', default: false })
  emailEnabled!: boolean;

  @Column({ name: 'whatsapp_enabled', default: false })
  whatsappEnabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
