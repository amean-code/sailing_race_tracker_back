import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookSubscription } from '../entities/webhook-subscription.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly webhooksRepo: Repository<WebhookSubscription>,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('**') // Listen to all events
  async handleAllEvents(payload: any, event: string) {
    // Ignore nestjs internal events if any, we only want race.*, boat.*, checkpoint.*
    if (!event.startsWith('race.') && !event.startsWith('boat.') && !event.startsWith('checkpoint.') && !event.startsWith('gps.')) {
      return;
    }

    try {
      const subscriptions = await this.webhooksRepo.find({ where: { isActive: true } });
      
      for (const sub of subscriptions) {
        if (sub.events.length === 0 || sub.events.includes(event) || sub.events.includes('*')) {
          this.sendWebhook(sub.url, event, payload).catch(err => {
            this.logger.error(`Webhook delivery failed for ${sub.url} on event ${event}: ${err.message}`);
            this.eventEmitter.emit('webhook.failed', { url: sub.url, event, error: err.message });
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to load webhook subscriptions: ${err.message}`);
    }
  }

  private async sendWebhook(url: string, event: string, payload: any, retryCount = 0) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      });
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
    } catch (err) {
      if (retryCount < 3) {
        this.logger.warn(`Retrying webhook ${url} for event ${event} (Attempt ${retryCount + 1})...`);
        this.eventEmitter.emit('webhook.retried', { url, event, retryCount: retryCount + 1 });
        setTimeout(() => {
          this.sendWebhook(url, event, payload, retryCount + 1);
        }, 1000 * Math.pow(2, retryCount)); // Exponential backoff (1s, 2s, 4s)
      } else {
        throw err;
      }
    }
  }
}

