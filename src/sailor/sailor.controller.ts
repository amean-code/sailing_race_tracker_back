import { Controller, Get, Param } from '@nestjs/common';
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

  @Get('applied-race-ids')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Yarışçının başvurduğu yarış kimlikleri' })
  async appliedRaceIds(@CurrentUser() user: SessionUser) {
    const raceIds = await this.sailorService.getAppliedRaceIds(user);
    return { raceIds };
  }

  @Get('active-race')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Yarışçının aktif check-in yarışı ve tekne bilgisi' })
  async activeRace(@CurrentUser() user: SessionUser) {
    return this.sailorService.getActiveRace(user);
  }

  @Get('race-results/:raceId')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Yarışçının belirli bir yarıştaki checkpoint istatistikleri' })
  async raceResults(
    @Param('raceId') raceId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.sailorService.getRaceResults(raceId, user);
  }
}
