import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseExportsService } from './course-exports.service';
import { CreateCourseExportDto } from './dto/course-export.dto';
import { AUTH_COOKIE } from '../common/constants';
import { CurrentUser, Public, Roles, SessionUser } from '../common/decorators';

@ApiTags('course-exports')
@Controller('course-exports')
export class CourseExportsController {
  constructor(private readonly courseExportsService: CourseExportsService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Herkese açık parkur görünümü' })
  async findOne(@Param('id') id: string) {
    const snapshot = await this.courseExportsService.findOnePublic(id);
    return { snapshot };
  }

  @Post()
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Kalıcı parkur görünüm linki oluştur' })
  async create(
    @Body() dto: CreateCourseExportDto,
    @CurrentUser() user: SessionUser,
  ) {
    const snapshot = await this.courseExportsService.create(dto, user);
    return { snapshot };
  }
}
