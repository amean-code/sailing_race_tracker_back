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
import { TrophiesService } from './trophies.service';
import { CreateTrophyDto, CreateTrophyLegDto, UpdateTrophyDto } from './dto/trophy.dto';
import { CurrentUser, Public, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('trophies')
@Controller('trophies')
export class TrophiesController {
  constructor(private readonly trophiesService: TrophiesService) {}

  @Get()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe yönetim listesi' })
  async findAll(@CurrentUser() user: SessionUser) {
    const trophies = await this.trophiesService.findAllManage(user);
    return { trophies };
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Herkese açık trofe listesi' })
  async findPublic() {
    const trophies = await this.trophiesService.findPublic();
    return { trophies };
  }

  @Public()
  @Get(':id/standings')
  @ApiOperation({ summary: 'Trofe genel sıralaması (low-point)' })
  async getStandings(@Param('id') id: string) {
    return this.trophiesService.getStandings(id);
  }

  @Get(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe detayı' })
  async findOne(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const trophy = await this.trophiesService.findOne(id, user);
    return { trophy };
  }

  @Post()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yeni trofe oluştur (yalnızca admin)' })
  async create(@Body() dto: CreateTrophyDto, @CurrentUser() user: SessionUser) {
    const trophy = await this.trophiesService.create(dto, user.sub, user);
    return { trophy };
  }

  @Patch(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe güncelle (yalnızca admin)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrophyDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trophy = await this.trophiesService.update(id, dto, user);
    return { trophy };
  }

  @Delete(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe sil (yalnızca admin)' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.trophiesService.remove(id, user);
  }

  @Post(':id/legs')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofeye ayak ekle (yalnızca admin)' })
  async addLeg(
    @Param('id') id: string,
    @Body() dto: CreateTrophyLegDto,
    @CurrentUser() user: SessionUser,
  ) {
    const race = await this.trophiesService.addLeg(id, dto, user);
    return { race };
  }
}
