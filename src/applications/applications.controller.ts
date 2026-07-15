import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { BulkUpdateApplicationDto, UpdateApplicationDto } from './dto/application.dto';
import { CurrentUser, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('applications')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiQuery({ name: 'raceId', required: false })
  @ApiOperation({ summary: 'Tüm yarış başvuruları' })
  async findAll(
    @CurrentUser() user: SessionUser,
    @Query('raceId') raceId?: string
  ) {
    const applications = await this.applicationsService.findAll(user, raceId);
    return { applications };
  }

  @Patch(':id')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Başvuru güncelle (onay, not vb.)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: SessionUser
  ) {
    const application = await this.applicationsService.update(id, dto, user);
    return { application };
  }

  @Post('bulk-update')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Toplu başvuru durumu güncelle' })
  async bulkUpdate(
    @Body() dto: BulkUpdateApplicationDto,
    @CurrentUser() user: SessionUser
  ) {
    const applications = await this.applicationsService.bulkUpdate(dto, user);
    return { applications };
  }
}
