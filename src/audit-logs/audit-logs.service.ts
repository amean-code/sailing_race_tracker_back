import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogsRepo: Repository<AuditLog>,
  ) {}

  @OnEvent('**', { async: true }) // listen asynchronously to avoid blocking
  async handleAllEvents(payload: any, event: string) {
    if (!event.startsWith('race.') && !event.startsWith('boat.') && !event.startsWith('course.') && !event.startsWith('webhook.') && !event.startsWith('penalty.') && !event.startsWith('results.')) {
      return;
    }
    
    try {
      const entity = this.auditLogsRepo.create({
        eventType: event,
        raceId: payload?.raceId || null,
        boatId: payload?.boatId || null,
        userId: payload?.userId || null,
        description: payload?.description || this.generateDefaultDescription(event, payload),
        metadata: payload,
      });
      await this.auditLogsRepo.save(entity);
    } catch (err: any) {
      this.logger.error(`Failed to save audit log for ${event}: ${err.message}`);
    }
  }

  private generateDefaultDescription(event: string, payload: any): string {
    switch (event) {
      case 'race.created': return 'Yarış oluşturuldu';
      case 'race.opened': return 'Yarış başvurulara açıldı';
      case 'race.countdown.started': return 'Yarış geri sayımı başladı';
      case 'race.started': return 'Yarış başladı';
      case 'race.finished': return 'Yarış tamamlandı';
      case 'race.cancelled': return 'Yarış iptal edildi';
      case 'race.suspended': return 'Yarış askıya alındı';
      case 'course.approved': return 'Parkur onaylandı';
      case 'boat.checked_in': return 'Tekne yarışa check-in yaptı';
      case 'checkpoint.passed': return `Checkpoint ${payload.checkpointIndex} geçildi`;
      case 'boat.finished': return 'Tekne yarışı tamamladı';
      case 'results.published': return 'Yarış sonuçları yayınlandı';
      case 'penalty.applied': return 'Ceza uygulandı';
      case 'webhook.failed': return 'Webhook gönderimi başarısız oldu';
      case 'webhook.retried': return 'Webhook gönderimi tekrar denendi';
      default: return `Sistem olayı: ${event}`;
    }
  }

  async getLogs(raceId?: string, limit = 50, offset = 0) {
    const qb = this.auditLogsRepo.createQueryBuilder('log');
    if (raceId) {
      qb.where('log.raceId = :raceId', { raceId });
    }
    qb.orderBy('log.createdAt', 'DESC');
    qb.take(limit);
    qb.skip(offset);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
