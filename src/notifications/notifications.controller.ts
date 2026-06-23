import { Body, Controller, Get, Put, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE } from '../common/constants';
import { Roles } from '../common/decorators';
import {
  TestEmailDto,
  TestWhatsAppDto,
  UpdateIntegrationsDto,
  UpdateRulesDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
@ApiCookieAuth(AUTH_COOKIE)
@Roles('ADMIN', 'COMMITTEE')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Bildirim entegrasyonları ve kuralları' })
  getSettings() {
    return this.notificationsService.getSettings();
  }

  @Put('integrations')
  @ApiOperation({ summary: 'SMTP ve Evolution WhatsApp ayarlarını güncelle' })
  updateIntegrations(@Body() dto: UpdateIntegrationsDto) {
    return this.notificationsService.updateIntegrations(dto);
  }

  @Put('rules')
  @ApiOperation({ summary: 'Olay bazlı bildirim kurallarını güncelle' })
  updateRules(@Body() dto: UpdateRulesDto) {
    return this.notificationsService.updateRules(dto);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Son bildirim kayıtları' })
  getLogs() {
    return this.notificationsService.getRecentLogs();
  }

  @Post('test/email')
  @ApiOperation({ summary: 'SMTP bağlantısını test et' })
  testEmail(@Body() dto: TestEmailDto) {
    return this.notificationsService.testEmail(dto);
  }

  @Post('test/whatsapp')
  @ApiOperation({ summary: 'Evolution WhatsApp bağlantısını test et' })
  testWhatsApp(@Body() dto: TestWhatsAppDto) {
    return this.notificationsService.testWhatsApp(dto);
  }
}
