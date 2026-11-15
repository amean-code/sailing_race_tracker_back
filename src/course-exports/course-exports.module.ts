import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseExportSnapshot } from '../entities/course-export-snapshot.entity';
import { CourseExportsController } from './course-exports.controller';
import { CourseExportsService } from './course-exports.service';

@Module({
  imports: [TypeOrmModule.forFeature([CourseExportSnapshot])],
  controllers: [CourseExportsController],
  providers: [CourseExportsService],
})
export class CourseExportsModule {}
