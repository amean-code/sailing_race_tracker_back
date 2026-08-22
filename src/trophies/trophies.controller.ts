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
import {
  CreateTrophyDto,
  CreateTrophyLegDto,
  CreateTrophyGroupDto,
  UpdateTrophyDto,
  UpdateTrophyGroupDto,
} from './dto/trophy.dto';
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

  @Get(':id/groups')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe tekne grupları listesi' })
  async listGroups(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const groups = await this.trophiesService.listGroups(id, user);
    return { groups };
  }

  @Post(':id/groups')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofeye tekne grubu ekle' })
  async createGroup(
    @Param('id') id: string,
    @Body() dto: CreateTrophyGroupDto,
    @CurrentUser() user: SessionUser,
  ) {
    const group = await this.trophiesService.createGroup(id, dto, user);
    return { group };
  }

  @Patch(':id/groups/:groupId')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe tekne grubunu güncelle' })
  async updateGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateTrophyGroupDto,
    @CurrentUser() user: SessionUser,
  ) {
    const group = await this.trophiesService.updateGroup(id, groupId, dto, user);
    return { group };
  }

  @Delete(':id/groups/:groupId')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Trofe tekne grubunu sil' })
  async removeGroup(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.trophiesService.removeGroup(id, groupId, user);
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
    const leg = await this.trophiesService.addLeg(id, dto, user);
    return { leg };
  }
}
