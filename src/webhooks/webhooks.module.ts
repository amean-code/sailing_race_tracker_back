import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksService } from './webhooks.service';
import { WebhookSubscription } from '../entities/webhook-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookSubscription])],
  providers: [WebhooksService]
})
export class WebhooksModule {}
