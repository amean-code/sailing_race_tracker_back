import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_EVENTS,
  NotificationAudienceEnum,
  NotificationEventEnum,
  UserRoleEnum,
} from '../common/constants';
import { NotificationIntegration } from '../entities/notification-integration.entity';
import { NotificationLog } from '../entities/notification-log.entity';
import { NotificationRule } from '../entities/notification-rule.entity';
import { User } from '../entities/user.entity';
import {
  NotificationRuleDto,
  TestEmailDto,
  TestWhatsAppDto,
  UpdateIntegrationsDto,
} from './dto/notifications.dto';
import { MailService } from './mail.service';
import { WhatsAppService } from './whatsapp.service';

export interface NotificationRecipient {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  unsubscribeToken?: string | null;
}

export interface NotificationContext {
  raceId?: string;
  raceTitle?: string;
  raceLocation?: string;
  raceStatus?: string;
  applicantName?: string;
  boatName?: string;
  sailNumber?: string;
  userName?: string;
  userEmail?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationIntegration)
    private readonly integrationsRepo: Repository<NotificationIntegration>,
    @InjectRepository(NotificationRule)
    private readonly rulesRepo: Repository<NotificationRule>,
    @InjectRepository(NotificationLog)
    private readonly logsRepo: Repository<NotificationLog>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {}

  private maskSecret(value: string | null | undefined) {
    if (!value) return null;
    if (value.length <= 4) return '****';
    return `${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
  }

  async getSettings() {
    let integration = await this.integrationsRepo.findOne({ where: { id: 'default' } });
    if (!integration) {
      integration = await this.integrationsRepo.save(
        this.integrationsRepo.create({ id: 'default' }),
      );
    }

    let rules = await this.rulesRepo.find({ order: { event: 'ASC', audience: 'ASC' } });
    if (rules.length === 0) {
      rules = await this.seedDefaultRules();
    }

    const whatsappState = await this.whatsAppService.checkInstanceState();

    return {
      integrations: {
        smtpEnabled: integration.smtpEnabled,
        smtpHost: integration.smtpHost,
        smtpPort: integration.smtpPort,
        smtpSecure: integration.smtpSecure,
        smtpUser: integration.smtpUser,
        smtpPassSet: Boolean(integration.smtpPass),
        smtpPassMasked: this.maskSecret(integration.smtpPass),
        smtpFrom: integration.smtpFrom,
        whatsappEnabled: integration.whatsappEnabled,
        evolutionApiUrl: integration.evolutionApiUrl,
        evolutionApiKeySet: Boolean(integration.evolutionApiKey),
        evolutionApiKeyMasked: this.maskSecret(integration.evolutionApiKey),
        evolutionInstance: integration.evolutionInstance,
        whatsappConnected: whatsappState.connected,
        whatsappState: whatsappState.state,
      },
      rules: rules.map((r) => ({
        id: r.id,
        event: r.event,
        audience: r.audience,
        enabled: r.enabled,
        emailEnabled: r.emailEnabled,
        whatsappEnabled: r.whatsappEnabled,
      })),
      events: NOTIFICATION_EVENTS,
      audiences: NOTIFICATION_AUDIENCES,
    };
  }

  private async seedDefaultRules() {
    const defaults: Array<{
      event: NotificationEventEnum;
      audience: NotificationAudienceEnum;
      enabled: boolean;
      emailEnabled: boolean;
      whatsappEnabled: boolean;
    }> = [
      { event: NotificationEventEnum.APPLICATION_SUBMITTED, audience: NotificationAudienceEnum.APPLICANT, enabled: true, emailEnabled: true, whatsappEnabled: false },
      { event: NotificationEventEnum.APPLICATION_SUBMITTED, audience: NotificationAudienceEnum.COMMITTEE, enabled: true, emailEnabled: true, whatsappEnabled: false },
      { event: NotificationEventEnum.APPLICATION_SUBMITTED, audience: NotificationAudienceEnum.ADMIN, enabled: true, emailEnabled: true, whatsappEnabled: false },
      { event: NotificationEventEnum.RACE_CREATED, audience: NotificationAudienceEnum.SAILOR, enabled: true, emailEnabled: true, whatsappEnabled: false },
      { event: NotificationEventEnum.RACE_STATUS_CHANGED, audience: NotificationAudienceEnum.SAILOR, enabled: true, emailEnabled: true, whatsappEnabled: false },
      { event: NotificationEventEnum.USER_REGISTERED, audience: NotificationAudienceEnum.ADMIN, enabled: true, emailEnabled: true, whatsappEnabled: false },
    ];
    const saved = await this.rulesRepo.save(defaults.map((d) => this.rulesRepo.create(d)));
    return saved;
  }

  async updateIntegrations(dto: UpdateIntegrationsDto) {
    let integration = await this.integrationsRepo.findOne({ where: { id: 'default' } });
    if (!integration) {
      integration = this.integrationsRepo.create({ id: 'default' });
    }

    if (dto.smtpEnabled !== undefined) integration.smtpEnabled = dto.smtpEnabled;
    if (dto.smtpHost !== undefined) integration.smtpHost = dto.smtpHost || null;
    if (dto.smtpPort !== undefined) integration.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) integration.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) integration.smtpUser = dto.smtpUser || null;
    if (dto.smtpPass !== undefined && dto.smtpPass !== '') integration.smtpPass = dto.smtpPass;
    if (dto.smtpFrom !== undefined) integration.smtpFrom = dto.smtpFrom || null;
    if (dto.whatsappEnabled !== undefined) integration.whatsappEnabled = dto.whatsappEnabled;
    if (dto.evolutionApiUrl !== undefined) integration.evolutionApiUrl = dto.evolutionApiUrl || null;
    if (dto.evolutionApiKey !== undefined && dto.evolutionApiKey !== '') {
      integration.evolutionApiKey = dto.evolutionApiKey;
    }
    if (dto.evolutionInstance !== undefined) {
      integration.evolutionInstance = dto.evolutionInstance || null;
    }

    await this.integrationsRepo.save(integration);
    return this.getSettings();
  }

  async updateRules(dto: { rules: NotificationRuleDto[] }) {
    for (const ruleDto of dto.rules) {
      let rule = await this.rulesRepo.findOne({
        where: { event: ruleDto.event, audience: ruleDto.audience },
      });
      if (!rule) {
        rule = this.rulesRepo.create({
          event: ruleDto.event,
          audience: ruleDto.audience,
        });
      }
      rule.enabled = ruleDto.enabled;
      rule.emailEnabled = ruleDto.emailEnabled;
      rule.whatsappEnabled = ruleDto.whatsappEnabled;
      await this.rulesRepo.save(rule);
    }
    return this.getSettings();
  }

  async getRecentLogs(limit = 50) {
    const logs = await this.logsRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return logs.map((l) => ({
      id: l.id,
      event: l.event,
      audience: l.audience,
      channel: l.channel,
      recipient: l.recipient,
      status: l.status,
      subject: l.subject,
      error: l.error,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  testEmail(dto: TestEmailDto) {
    return this.mailService.testConnection(dto.to);
  }

  testWhatsApp(dto: TestWhatsAppDto) {
    return this.whatsAppService.testConnection(dto.phone, dto.message);
  }

  private buildHtmlTemplate(title: string, contentHtml: string, recipient: NotificationRecipient, frontendUrl: string): string {
    const unsubscribeLink = recipient.unsubscribeToken 
      ? `<div style="margin-top: 40px; text-align: center; font-size: 12px; color: #888;">Eğer bu tür e-postaları almak istemiyorsanız <a href="${frontendUrl}/unsubscribe?token=${recipient.unsubscribeToken}" style="color: #666; text-decoration: underline;">tıklayın</a>.</div>`
      : '';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 12px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1e40af; margin-top: 0; text-align: center;">${title}</h2>
          ${contentHtml}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">Detaylar için <a href="${frontendUrl}" style="color: #2563eb; text-decoration: none; font-weight: bold;">Themis Race Tracker</a>'ı ziyaret edin.</p>
          </div>
        </div>
        ${unsubscribeLink}
      </div>
    `;
  }

  private buildMessage(event: NotificationEventEnum, ctx: NotificationContext) {
    const race = ctx.raceTitle ? `"${ctx.raceTitle}"` : 'Yarış';
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    
    switch (event) {
      case NotificationEventEnum.APPLICATION_SUBMITTED:
        return {
          subject: `Başvuru alındı — ${ctx.raceTitle ?? 'Yarış'}`,
          text: `Merhaba ${ctx.applicantName ?? ''},\n\n${race} yarışına başvurunuz alındı.\nTekne: ${ctx.boatName ?? '-'} #${ctx.sailNumber ?? '-'}\n\nThemis Race Tracker`,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Merhaba ${ctx.applicantName || recipient.name || ''},</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;"><strong>${race}</strong> yarışına başvurunuz başarıyla alındı.</p>
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #4b5563;"><strong>Tekne:</strong> ${ctx.boatName ?? '-'}</p>
                <p style="margin: 0; color: #4b5563;"><strong>Yelken No:</strong> ${ctx.sailNumber ?? '-'}</p>
              </div>
            `;
            return this.buildHtmlTemplate('Başvuru Alındı', content, recipient, frontendUrl);
          }
        };
      case NotificationEventEnum.RACE_CREATED: {
        const text = `Yeni bir yarış yayınlandı: ${race}\nKonum: ${ctx.raceLocation ?? '-'}\n\nKayıt için Themis Race Tracker'ı ziyaret edin.`;
        return {
          subject: `Yeni yarış duyurusu — ${ctx.raceTitle ?? ''}`,
          text,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const applyButton = ctx.raceStatus === 'REGISTRATION_OPEN' && ctx.raceId
              ? `<div style="text-align: center; margin: 30px 0;"><a href="${frontendUrl}/panel/sailor/races" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Hemen Başvur</a></div>`
              : '';

            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Merhaba,</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;"><strong>${race}</strong> yarışı sistemde yayınlandı ve detaylar açıklandı.</p>
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; color: #4b5563;"><strong>Konum:</strong> ${ctx.raceLocation ?? '-'}</p>
                <p style="margin: 8px 0 0 0; color: #4b5563;"><strong>Durum:</strong> Kayıtlar Açık</p>
              </div>
              ${applyButton}
            `;
            return this.buildHtmlTemplate('Yeni Yarış Duyurusu!', content, recipient, frontendUrl);
          }
        };
      }
      case NotificationEventEnum.RACE_UPDATED:
        return {
          subject: `Yarış güncellendi — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarış bilgileri güncellendi. Detaylar için Themis Race Tracker'ı kontrol edin.`,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Merhaba,</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Kayıtlı olduğunuz veya takip ettiğiniz <strong>${race}</strong> yarışının bilgileri komite tarafından güncellendi.</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Lütfen güncel bilgileri sistem üzerinden kontrol ediniz.</p>
            `;
            return this.buildHtmlTemplate('Yarış Bilgileri Güncellendi', content, recipient, frontendUrl);
          }
        };
      case NotificationEventEnum.RACE_STATUS_CHANGED:
        return {
          subject: `Kayıt durumu değişti — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarışının kayıt durumu: ${ctx.raceStatus ?? 'güncellendi'}.\n\nThemis Race Tracker`,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const statusMap: Record<string, string> = {
              'REGISTRATION_OPEN': 'Kayıtlar Açıldı',
              'REGISTRATION_CLOSED': 'Kayıtlar Kapandı',
              'IN_PROGRESS': 'Yarış Başladı',
              'FINISHED': 'Yarış Tamamlandı',
              'SUSPENDED': 'Yarış Askıya Alındı'
            };
            const readableStatus = ctx.raceStatus ? (statusMap[ctx.raceStatus] || ctx.raceStatus) : 'Güncellendi';
            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Merhaba,</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;"><strong>${race}</strong> yarışının durumu güncellendi.</p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 0 6px 6px 0; margin: 20px 0;">
                <p style="margin: 0; color: #166534; font-size: 18px; font-weight: bold;">Yeni Durum: ${readableStatus}</p>
              </div>
            `;
            return this.buildHtmlTemplate('Yarış Durumu Değişti', content, recipient, frontendUrl);
          }
        };
      case NotificationEventEnum.RACE_DELETED:
        return {
          subject: `Yarış iptal edildi — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarışı sistemden kaldırıldı.`,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Merhaba,</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Maalesef <strong>${race}</strong> yarışı komite tarafından iptal edilmiş veya sistemden kaldırılmıştır.</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Bu yarış ile ilgili başvurular da geçersiz sayılacaktır.</p>
            `;
            return this.buildHtmlTemplate('Yarış İptal Edildi', content, recipient, frontendUrl);
          }
        };
      case NotificationEventEnum.USER_REGISTERED:
        return {
          subject: `Yeni kullanıcı kaydı — ${ctx.userName ?? ctx.userEmail ?? ''}`,
          text: `Yeni kullanıcı kaydı: ${ctx.userName ?? '-'} (${ctx.userEmail ?? '-'})\n\nThemis Race Tracker`,
          htmlBuilder: (recipient: NotificationRecipient) => {
            const content = `
              <p style="color: #374151; font-size: 16px; line-height: 1.5;">Sisteme yeni bir kullanıcı kayıt oldu.</p>
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #4b5563;"><strong>İsim:</strong> ${ctx.userName ?? '-'}</p>
                <p style="margin: 0; color: #4b5563;"><strong>E-posta:</strong> ${ctx.userEmail ?? '-'}</p>
              </div>
            `;
            return this.buildHtmlTemplate('Yeni Kullanıcı Kaydı', content, recipient, frontendUrl);
          }
        };
      default:
        return { subject: 'Themis Race Tracker Bildirimi', text: 'Yeni bir bildiriminiz var.' };
    }
  }

  private async resolveRecipients(
    audience: NotificationAudienceEnum,
    direct?: NotificationRecipient,
  ): Promise<NotificationRecipient[]> {
    if (audience === NotificationAudienceEnum.APPLICANT && direct) {
      return [direct];
    }

    const roleMap: Record<string, UserRoleEnum> = {
      [NotificationAudienceEnum.SAILOR]: UserRoleEnum.SAILOR,
      [NotificationAudienceEnum.COMMITTEE]: UserRoleEnum.COMMITTEE,
      [NotificationAudienceEnum.ADMIN]: UserRoleEnum.ADMIN,
    };

    const role = roleMap[audience];
    if (!role) return [];

    const users = await this.usersRepo.find({
      where: { role, receiveEmails: true },
      select: ['email', 'phone', 'name', 'unsubscribeToken'],
    });
    return users.map((u) => ({
      email: u.email,
      phone: u.phone,
      name: u.name,
      unsubscribeToken: u.unsubscribeToken,
    }));
  }

  private async logDelivery(
    event: NotificationEventEnum,
    audience: NotificationAudienceEnum,
    channel: 'EMAIL' | 'WHATSAPP',
    recipient: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    subject: string | null,
    error: string | null,
  ) {
    await this.logsRepo.save(
      this.logsRepo.create({
        event,
        audience,
        channel,
        recipient,
        status,
        subject,
        error,
      }),
    );
  }

  async dispatch(
    event: NotificationEventEnum,
    context: NotificationContext,
    applicant?: NotificationRecipient,
  ) {
    const rules = await this.rulesRepo.find({ where: { event, enabled: true } });
    const { subject, text, htmlBuilder } = this.buildMessage(event, context);

    for (const rule of rules) {
      const recipients = await this.resolveRecipients(rule.audience, applicant);
      for (const recipient of recipients) {
        if (rule.emailEnabled && recipient.email) {
          const html = htmlBuilder ? htmlBuilder(recipient) : undefined;
          const result = await this.mailService.sendMail(recipient.email, subject, text, html);
          await this.logDelivery(
            event,
            rule.audience,
            'EMAIL',
            recipient.email,
            result.ok ? 'SENT' : 'FAILED',
            subject,
            result.ok ? null : (result.error ?? null),
          );
        } else if (rule.emailEnabled && !recipient.email) {
          await this.logDelivery(event, rule.audience, 'EMAIL', '-', 'SKIPPED', subject, 'E-posta yok');
        }

        if (rule.whatsappEnabled && recipient.phone) {
          const result = await this.whatsAppService.sendText(recipient.phone, text);
          await this.logDelivery(
            event,
            rule.audience,
            'WHATSAPP',
            recipient.phone,
            result.ok ? 'SENT' : 'FAILED',
            subject,
            result.ok ? null : (result.error ?? null),
          );
        } else if (rule.whatsappEnabled && !recipient.phone) {
          await this.logDelivery(event, rule.audience, 'WHATSAPP', '-', 'SKIPPED', subject, 'Telefon yok');
        }
      }
    }
  }

  async getUnsubscribeStatus(token: string) {
    const user = await this.usersRepo.findOne({ where: { unsubscribeToken: token } });
    if (!user) {
      return { found: false };
    }
    return { found: true, receiveEmails: user.receiveEmails, email: user.email };
  }

  async toggleUnsubscribe(token: string, receiveEmails: boolean) {
    const user = await this.usersRepo.findOne({ where: { unsubscribeToken: token } });
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    user.receiveEmails = receiveEmails;
    await this.usersRepo.save(user);
    return { success: true, receiveEmails: user.receiveEmails };
  }

  dispatchAsync(
    event: NotificationEventEnum,
    context: NotificationContext,
    applicant?: NotificationRecipient,
  ) {
    void this.dispatch(event, context, applicant).catch(() => undefined);
  }
}
