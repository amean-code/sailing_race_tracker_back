import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SailorService } from './sailor.service';
import { Roles, CurrentUser, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('sailor')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('sailor')
export class SailorController {
  constructor(private readonly sailorService: SailorService) {}

  @Get('dashboard')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Yarışçı paneli özet verileri' })
  async dashboard(@CurrentUser() user: SessionUser) {
    return this.sailorService.getDashboard(user);
  }
}
