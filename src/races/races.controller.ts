import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RacesService } from './races.service';
import { RaceFleetService } from './race-fleet.service';
import { CreateRaceDto, RaceApplicationDto, UpdateRaceDto, RaceActionDto } from './dto/race.dto';
import { CheckInDto } from './dto/check-in.dto';
import { RecordCheckpointPassDto } from './dto/checkpoint-pass.dto';
import { CurrentUser, Public, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('races')
@Controller('races')
export class RacesController {
  constructor(
    private readonly racesService: RacesService,
    private readonly raceFleetService: RaceFleetService,
  ) {}

  @Get()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarışları yönetim listesi (COMMITTEE/ADMIN/SUPER_ADMIN)' })
  @ApiQuery({ name: 'status', required: false, description: 'Comma separated status list (e.g. FINISHED,CANCELLED)' })
  async findAllManage(@CurrentUser() user: SessionUser, @Query('status') status?: string) {
    const races = await this.racesService.findAllManage(user, status);
    return { races };
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Açık kayıtlı yarışlar (herkese açık)' })
  async findPublic() {
    const races = await this.racesService.findPublic();
    return { races };
  }

  @Public()
  @Post('public/:id/applications')
  @ApiOperation({ summary: 'Yarışa başvuru gönder' })
  async submitApplication(
    @Param('id') id: string,
    @Body() dto: RaceApplicationDto,
    @CurrentUser() user?: SessionUser,
  ) {
    const application = await this.racesService.submitApplication(id, dto, user);
    return { application };
  }

  @Get(':id/competitors')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış katılımcıları (başvuru + tekne + konum)' })
  async getCompetitors(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.raceFleetService.getCompetitors(id, user);
  }

  @Get(':id/live-trails')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Canlı takip için geçmiş rotalar (startı geçenler)' })
  async getLiveTrails(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const trails = await this.racesService.getLiveTrails(id, user);
    return { trails };
  }

  @Post(':id/check-in')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Başvuruyu check-in yap ve tekne oluştur' })
  async checkIn(@Param('id') id: string, @Body() dto: CheckInDto, @CurrentUser() user: SessionUser) {
    return this.raceFleetService.checkIn(id, dto.applicationId, user);
  }

  @Get(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış detayı' })
  async findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const race = await this.racesService.findOne(id, user);
    return { race };
  }

  @Post()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yeni yarış oluştur (yalnızca admin)' })
  async create(@Body() dto: CreateRaceDto, @CurrentUser() user: SessionUser) {
    const race = await this.racesService.create(dto, user.sub);
    return { race };
  }

  @Post(':id/clone')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarışı klonla (yalnızca admin)' })
  async clone(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const race = await this.racesService.cloneRace(id, user.sub, user);
    return { race };
  }

  @Patch(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış güncelle' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRaceDto,
    @CurrentUser() user: SessionUser,
  ) {
    const race = await this.racesService.update(id, dto, user);
    return { race };
  }

  @Post(':id/actions')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış operasyonları (bitir, tatil et, baştan başlat)' })
  async handleAction(
    @Param('id') id: string,
    @Body() dto: RaceActionDto,
    @CurrentUser() user: SessionUser,
  ) {
    const race = await this.racesService.handleRaceAction(id, dto, user);
    return { race };
  }

  @Delete(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış sil (yalnızca admin)' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.racesService.remove(id, user);
  }

  @Post(':id/checkpoint-pass')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarışçı checkpoint geçişini kaydet' })
  async recordCheckpointPass(
    @Param('id') id: string,
    @Body() dto: RecordCheckpointPassDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.racesService.recordCheckpointPass(id, dto, user);
  }

  @Public()
  @Get(':id/standings')
  @ApiOperation({ summary: 'Yarış sonuçları (tekne ve süreler)' })
  async getStandings(@Param('id') id: string) {
    return this.racesService.getStandings(id);
  }
  @Public()
  @Get(':id/playback-data')
  @ApiOperation({ summary: 'Yarış tekrar oynatma verileri (TrackPoints)' })
  async getPlaybackData(@Param('id') id: string) {
    return this.racesService.getPlaybackData(id);
  }

  @Get(':id/export-results')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış sonuçlarını dışa aktar (CSV veya Excel/XLSX, tüm checkpoint geçişleriyle)' })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'xlsx'],
    description: 'Dışa aktarma formatı (varsayılan: csv)',
  })
  async exportRaceResults(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: SessionUser,
    @Res() res: Response,
  ) {
    const normalized = String(format || 'csv').toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const file = await this.racesService.exportRaceResults(id, normalized, user);
    const safeFilename = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || `race-results.${normalized}`;
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    return res.send(file.body);
  }
}
