import { Injectable } from '@nestjs/common';
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
}

export interface NotificationContext {
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

  private buildMessage(event: NotificationEventEnum, ctx: NotificationContext) {
    const race = ctx.raceTitle ? `"${ctx.raceTitle}"` : 'Yarış';
    switch (event) {
      case NotificationEventEnum.APPLICATION_SUBMITTED:
        return {
          subject: `Başvuru alındı — ${ctx.raceTitle ?? 'Yarış'}`,
          text: `Merhaba ${ctx.applicantName ?? ''},\n\n${race} yarışına başvurunuz alındı.\nTekne: ${ctx.boatName ?? '-'} #${ctx.sailNumber ?? '-'}\n\nBAYK Tracker`,
        };
      case NotificationEventEnum.RACE_CREATED:
        return {
          subject: `Yeni yarış duyurusu — ${ctx.raceTitle ?? ''}`,
          text: `Yeni bir yarış yayınlandı: ${race}\nKonum: ${ctx.raceLocation ?? '-'}\n\nKayıt için BAYK Tracker'ı ziyaret edin.`,
        };
      case NotificationEventEnum.RACE_UPDATED:
        return {
          subject: `Yarış güncellendi — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarış bilgileri güncellendi. Detaylar için BAYK Tracker'ı kontrol edin.`,
        };
      case NotificationEventEnum.RACE_STATUS_CHANGED:
        return {
          subject: `Kayıt durumu değişti — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarışının kayıt durumu: ${ctx.raceStatus ?? 'güncellendi'}.\n\nBAYK Tracker`,
        };
      case NotificationEventEnum.RACE_DELETED:
        return {
          subject: `Yarış iptal edildi — ${ctx.raceTitle ?? ''}`,
          text: `${race} yarışı sistemden kaldırıldı.`,
        };
      case NotificationEventEnum.USER_REGISTERED:
        return {
          subject: `Yeni kullanıcı kaydı — ${ctx.userName ?? ctx.userEmail ?? ''}`,
          text: `Yeni kullanıcı kaydı: ${ctx.userName ?? '-'} (${ctx.userEmail ?? '-'})\n\nBAYK Tracker`,
        };
      default:
        return { subject: 'BAYK Tracker Bildirimi', text: 'Yeni bir bildiriminiz var.' };
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
      where: { role },
      select: ['email', 'phone', 'name'],
    });
    return users.map((u) => ({ email: u.email, phone: u.phone, name: u.name }));
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
    const { subject, text } = this.buildMessage(event, context);

    for (const rule of rules) {
      const recipients = await this.resolveRecipients(rule.audience, applicant);
      for (const recipient of recipients) {
        if (rule.emailEnabled && recipient.email) {
          const result = await this.mailService.sendMail(recipient.email, subject, text);
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

  dispatchAsync(
    event: NotificationEventEnum,
    context: NotificationContext,
    applicant?: NotificationRecipient,
  ) {
    void this.dispatch(event, context, applicant).catch(() => undefined);
  }
}
