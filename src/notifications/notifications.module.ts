import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationIntegration } from '../entities/notification-integration.entity';
import { NotificationLog } from '../entities/notification-log.entity';
import { NotificationRule } from '../entities/notification-rule.entity';
import { User } from '../entities/user.entity';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationIntegration,
      NotificationRule,
      NotificationLog,
      User,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, MailService, WhatsAppService],
  exports: [NotificationsService, MailService],
})
export class NotificationsModule {}
