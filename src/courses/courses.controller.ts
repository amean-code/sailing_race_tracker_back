import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { Roles } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('courses')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Tüm parkurları listele' })
  async findAll() {
    const courses = await this.coursesService.findAll();
    return { courses };
  }

  @Get(':id')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Parkur detayı' })
  async findOne(@Param('id') id: string) {
    const course = await this.coursesService.findOne(id);
    return { course };
  }

  @Post()
  @Roles('COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Yeni parkur oluştur' })
  async create(@Body() dto: CreateCourseDto) {
    const course = await this.coursesService.create(dto);
    return { course };
  }

  @Put(':id')
  @Roles('COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Parkuru güncelle' })
  async update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    const course = await this.coursesService.update(id, dto);
    return { course };
  }

  @Delete(':id')
  @Roles('COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Parkuru sil' })
  async remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }
}
