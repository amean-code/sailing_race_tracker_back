import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegsService } from './legs.service';
import { CreateLegDto, CreateRaceUnderLegDto, UpdateLegDto } from './dto/leg.dto';
import { RaceApplicationDto } from '../races/dto/race.dto';
import { CurrentUser, Public, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('legs')
@Controller('legs')
export class LegsController {
  constructor(private readonly legsService: LegsService) {}

  @Get()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ayak / regata / tek yarış yönetim listesi' })
  async findAll(@CurrentUser() user: SessionUser) {
    const legs = await this.legsService.findAllManage(user);
    return { legs };
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Herkese açık regata / tek yarış listesi' })
  async findPublic() {
    const legs = await this.legsService.findPublic();
    return { legs };
  }

  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'Herkese açık ayak detayı' })
  async findOnePublic(@Param('id') id: string) {
    const leg = await this.legsService.findOnePublic(id);
    return { leg };
  }

  @Get(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ayak detayı' })
  async findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const leg = await this.legsService.findOne(id, user);
    return { leg };
  }

  @Post()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Regata veya tek yarış oluştur' })
  async create(@Body() dto: CreateLegDto, @CurrentUser() user: SessionUser) {
    const leg = await this.legsService.create(dto, user);
    return { leg };
  }

  @Patch(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ayak güncelle' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLegDto,
    @CurrentUser() user: SessionUser,
  ) {
    const leg = await this.legsService.update(id, dto, user);
    return { leg };
  }

  @Delete(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ayak sil' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.legsService.remove(id, user);
  }

  @Post(':id/races')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ayak altına yarış ekle' })
  async addRace(
    @Param('id') id: string,
    @Body() dto: CreateRaceUnderLegDto,
    @CurrentUser() user: SessionUser,
  ) {
    const race = await this.legsService.addRace(id, dto, user);
    return { race };
  }

  @Public()
  @Post(':id/applications')
  @ApiOperation({ summary: 'Ayağa başvuru yap' })
  async submitApplication(
    @Param('id') id: string,
    @Body() dto: RaceApplicationDto,
    @CurrentUser() user: SessionUser | undefined,
  ) {
    const application = await this.legsService.submitApplication(id, dto, user);
    return { application };
  }
}
