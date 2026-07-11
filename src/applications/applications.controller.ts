import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { UpdateApplicationDto } from './dto/application.dto';
import { Roles } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('applications')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @Roles('COMMITTEE', 'ADMIN')
  @ApiQuery({ name: 'raceId', required: false })
  @ApiOperation({ summary: 'Tüm yarış başvuruları' })
  async findAll(@Query('raceId') raceId?: string) {
    const applications = await this.applicationsService.findAll(raceId);
    return { applications };
  }

  @Patch(':id')
  @Roles('COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Başvuru güncelle (onay, not vb.)' })
  async update(@Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    const application = await this.applicationsService.update(id, dto);
    return { application };
  }
}
