import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RacesService } from './races.service';
import { RaceFleetService } from './race-fleet.service';
import { CreateRaceDto, RaceApplicationDto, UpdateRaceDto } from './dto/race.dto';
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
  async findAllManage() {
    const races = await this.racesService.findAllManage();
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
  ) {
    const application = await this.racesService.submitApplication(id, dto);
    return { application };
  }

  @Get(':id/competitors')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış katılımcıları (başvuru + tekne + konum)' })
  async getCompetitors(@Param('id') id: string) {
    return this.raceFleetService.getCompetitors(id);
  }

  @Post(':id/check-in')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Başvuruyu check-in yap ve tekne oluştur' })
  async checkIn(@Param('id') id: string, @Body() dto: CheckInDto) {
    return this.raceFleetService.checkIn(id, dto.applicationId);
  }

  @Get(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış detayı' })
  async findOne(@Param('id') id: string) {
    const race = await this.racesService.findOne(id);
    return { race };
  }

  @Post()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yeni yarış oluştur' })
  async create(@Body() dto: CreateRaceDto, @CurrentUser() user: SessionUser) {
    const race = await this.racesService.create(dto, user.sub);
    return { race };
  }

  @Post(':id/clone')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarışı klonla' })
  async clone(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const race = await this.racesService.cloneRace(id, user.sub);
    return { race };
  }

  @Patch(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış güncelle' })
  async update(@Param('id') id: string, @Body() dto: UpdateRaceDto) {
    const race = await this.racesService.update(id, dto);
    return { race };
  }

  @Delete(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarış sil (COMMITTEE/ADMIN/SUPER_ADMIN)' })
  async remove(@Param('id') id: string) {
    return this.racesService.remove(id);
  }

  @Post(':id/checkpoint-pass')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yarışçı checkpoint geçişini kaydet' })
  async recordCheckpointPass(
    @Param('id') id: string,
    @Body() dto: RecordCheckpointPassDto,
  ) {
    return this.racesService.recordCheckpointPass(id, dto);
  }

  @Get(':id/standings')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Anlık yarış sıralaması' })
  async getStandings(@Param('id') id: string) {
    return this.racesService.getStandings(id);
  }
}
