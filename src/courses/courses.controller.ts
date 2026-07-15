import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Patch,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, UpdateCourseStatusDto, TransferCourseDto } from './dto/course.dto';
import { CurrentUser, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('courses')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Tüm parkurları listele' })
  async findAll() {
    const courses = await this.coursesService.findAll();
    return { courses };
  }

  @Get(':id')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Parkur detayı' })
  async findOne(@Param('id') id: string) {
    const course = await this.coursesService.findOne(id);
    return { course };
  }

  @Post()
  @Roles('COMMITTEE', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yeni parkur oluştur' })
  async create(@Body() dto: CreateCourseDto, @CurrentUser() user: SessionUser) {
    const course = await this.coursesService.create(dto, user?.sub);
    return { course };
  }

  @Put(':id')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Parkuru güncelle' })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto, @CurrentUser() user: SessionUser) {
    const course = await this.coursesService.update(id, dto, user);
    return { course };
  }

  @Delete(':id')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Parkuru sil' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.coursesService.remove(id, user);
  }

  @Patch(':id/status')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Parkur durumunu güncelle' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateCourseStatusDto, @CurrentUser() user: SessionUser) {
    const course = await this.coursesService.updateStatus(id, dto.status, user);
    return { course };
  }

  @Patch(':id/transfer')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Parkuru devret (Sadece Super Admin)' })
  async transferOwner(@Param('id') id: string, @Body() dto: TransferCourseDto, @CurrentUser() user: SessionUser) {
    const course = await this.coursesService.transferOwner(id, dto.newOwnerId, user);
    return { course };
  }
}
