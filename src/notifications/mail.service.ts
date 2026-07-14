import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import { NotificationIntegration } from '../entities/notification-integration.entity';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

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

  async sendMail(to: string, subject: string, text: string, html?: string) {
    const config = await this.getIntegration();
    if (!config.smtpEnabled || !config.smtpHost) {
      return { ok: false, error: 'SMTP devre dışı veya yapılandırılmamış' };
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPass ?? '' }
        : undefined,
    });

    try {
      await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser || 'noreply@themis.tracker',
        to,
        subject,
        text,
        html: html ?? text.replace(/\n/g, '<br>'),
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'E-posta gönderilemedi';
      this.logger.error(`SMTP error: ${message}`);
      return { ok: false, error: message };
    }
  }

  async testConnection(to: string) {
    return this.sendMail(
      to,
      'Themis Race Tracker — SMTP Test',
      'Bu mesaj Themis Race Tracker SMTP entegrasyon testidir. Bağlantı başarılı.',
    );
  }
}
