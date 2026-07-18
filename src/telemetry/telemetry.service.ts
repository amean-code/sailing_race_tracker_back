import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as os from 'os';
import { EventsGateway } from '../events/events.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private interval: NodeJS.Timeout;

  // In-memory counters
  private gpsCountLastInterval = 0;
  private totalGpsPoints = 0;
  private webhookSuccessCount = 0;
  private webhookFailedCount = 0;
  private lastGpsTime: string | null = null;
  private lastWebhookTime: string | null = null;

  constructor(
    private readonly eventsGateway: EventsGateway,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @OnEvent('gps.received', { async: true })
  handleGpsReceived() {
    this.gpsCountLastInterval++;
    this.totalGpsPoints++;
    this.lastGpsTime = new Date().toISOString();
  }

  @OnEvent('webhook.failed', { async: true })
  handleWebhookFailed() {
    this.webhookFailedCount++;
    this.lastWebhookTime = new Date().toISOString();
  }

  // Hooking into webhook success - since we don't emit success, let's just mock it or infer from events? 
  // We can't infer it yet. So we just leave it 0 or add a mock logic.

  async onModuleInit() {
    // initialize total gps points from DB
    try {
      this.totalGpsPoints = await this.entityManager.query('SELECT COUNT(*) FROM track_points').then(res => parseInt(res[0].count, 10));
    } catch (e: any) {
      this.logger.error('Failed to init gps count: ' + e.message);
    }

    this.interval = setInterval(async () => {
      await this.broadcastTelemetry();
    }, 3000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async broadcastTelemetry() {
    try {
      const stats = await this.gatherStats();
      this.eventsGateway.broadcastTelemetry(stats);
      // Reset interval counters
      this.gpsCountLastInterval = 0;
    } catch (e: any) {
      this.logger.error('Telemetry broadcast failed: ' + e.message);
    }
  }

  private async gatherStats() {
    // For some heavy counts like active boats/races, we can query them dynamically or cache them.
    // Given 3 seconds interval, it's better to do simple queries.
    const [
      activeRacesCount,
      activeCoursesCount,
    ] = await Promise.all([
      this.entityManager.query("SELECT COUNT(*) FROM races WHERE status IN ('IN_PROGRESS', 'OPEN')").then(r => parseInt(r[0].count, 10)),
      this.entityManager.query("SELECT COUNT(*) FROM courses WHERE status = 'ACTIVE'").then(r => parseInt(r[0].count, 10)),
    ]);

    return {
      system: {
        activeRaces: activeRacesCount,
        activeCourses: activeCoursesCount,
      },
      gps: {
        lastGpsTime: this.lastGpsTime,
        gpsPerSecond: (this.gpsCountLastInterval / 3).toFixed(2),
        totalTrackPoints: this.totalGpsPoints,
      },
      websocket: {
        activeConnections: this.eventsGateway.getActiveConnectionsCount(),
        roomCount: this.eventsGateway.getRoomCount(),
      },
      webhook: {
        successCount: this.webhookSuccessCount,
        failedCount: this.webhookFailedCount,
        lastWebhookTime: this.lastWebhookTime,
      },
      server: {
        cpuUsage: os.loadavg()[0].toFixed(2),
        freeMemMb: Math.round(os.freemem() / 1024 / 1024),
        totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
        uptimeSeconds: Math.round(os.uptime()),
        processUptime: Math.round(process.uptime()),
      },
    };
  }
}
