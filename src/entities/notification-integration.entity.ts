import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_integrations')
export class NotificationIntegration {
  @PrimaryColumn({ type: 'text', default: 'default' })
  id!: string;

  @Column({ name: 'smtp_enabled', default: false })
  smtpEnabled!: boolean;

  @Column({ name: 'smtp_host', type: 'text', nullable: true })
  smtpHost!: string | null;

  @Column({ name: 'smtp_port', type: 'int', default: 587 })
  smtpPort!: number;

  @Column({ name: 'smtp_secure', default: false })
  smtpSecure!: boolean;

  @Column({ name: 'smtp_user', type: 'text', nullable: true })
  smtpUser!: string | null;

  @Column({ name: 'smtp_pass', type: 'text', nullable: true })
  smtpPass!: string | null;

  @Column({ name: 'smtp_from', type: 'text', nullable: true })
  smtpFrom!: string | null;

  @Column({ name: 'whatsapp_enabled', default: false })
  whatsappEnabled!: boolean;

  @Column({ name: 'evolution_api_url', type: 'text', nullable: true })
  evolutionApiUrl!: string | null;

  @Column({ name: 'evolution_api_key', type: 'text', nullable: true })
  evolutionApiKey!: string | null;

  @Column({ name: 'evolution_instance', type: 'text', nullable: true })
  evolutionInstance!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
