import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get(':key')
  async getSetting(@Param('key') key: string) {
    const value = await this.settingsService.getSetting(key);
    return { key, value };
  }

  @Roles('SUPER_ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put(':key')
  async setSetting(@Param('key') key: string, @Body() payload: any) {
    const setting = await this.settingsService.setSetting(key, payload.value);
    return { key: setting.key, value: setting.value };
  }
}
