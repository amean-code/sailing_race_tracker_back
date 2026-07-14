import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationIntegration } from '../entities/notification-integration.entity';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectRepository(NotificationIntegration)
    private readonly integrationsRepo: Repository<NotificationIntegration>,
  ) {}

  private async getIntegration() {
    let row = await this.integrationsRepo.findOne({ where: { id: 'default' } });
    if (!row) {
      row = await this.integrationsRepo.save(
        this.integrationsRepo.create({ id: 'default' }),
      );
    }
    return row;
  }

  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) return `90${digits.slice(1)}`;
    if (digits.length === 10) return `90${digits}`;
    return digits;
  }

  async sendText(phone: string, text: string) {
    const config = await this.getIntegration();
    if (!config.whatsappEnabled || !config.evolutionApiUrl || !config.evolutionInstance) {
      return { ok: false, error: 'WhatsApp (Evolution API) devre dışı veya yapılandırılmamış' };
    }

    const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
    const url = `${baseUrl}/message/sendText/${config.evolutionInstance}`;
    const number = this.normalizePhone(phone);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.evolutionApiKey ? { apikey: config.evolutionApiKey } : {}),
        },
        body: JSON.stringify({ number, text }),
      });

      if (!res.ok) {
        const body = await res.text();
        const message = body || `Evolution API hata: ${res.status}`;
        this.logger.error(`WhatsApp error: ${message}`);
        return { ok: false, error: message };
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WhatsApp mesajı gönderilemedi';
      this.logger.error(`WhatsApp error: ${message}`);
      return { ok: false, error: message };
    }
  }

  async testConnection(phone: string, message?: string) {
    return this.sendText(
      phone,
      message ||
        'Themis Race Tracker — Evolution WhatsApp entegrasyon testi. Bağlantı başarılı.',
    );
  }

  async checkInstanceState() {
    const config = await this.getIntegration();
    if (!config.evolutionApiUrl || !config.evolutionInstance) {
      return { connected: false, state: 'not_configured' };
    }

    const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
    const url = `${baseUrl}/instance/connectionState/${config.evolutionInstance}`;

    try {
      const res = await fetch(url, {
        headers: config.evolutionApiKey ? { apikey: config.evolutionApiKey } : {},
      });
      if (!res.ok) return { connected: false, state: 'error' };
      const data = (await res.json()) as { instance?: { state?: string }; state?: string };
      const state = data?.instance?.state ?? data?.state ?? 'unknown';
      return { connected: state === 'open', state };
    } catch {
      return { connected: false, state: 'unreachable' };
    }
  }
}
