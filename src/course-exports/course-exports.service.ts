import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseExportSnapshot } from '../entities/course-export-snapshot.entity';
import { CreateCourseExportDto } from './dto/course-export.dto';
import { SessionUser } from '../common/decorators';

@Injectable()
export class CourseExportsService {
  constructor(
    @InjectRepository(CourseExportSnapshot)
    private readonly exportsRepo: Repository<CourseExportSnapshot>,
  ) {}

  serialize(row: CourseExportSnapshot) {
    return {
      id: row.id,
      title: row.title,
      raceTitle: row.raceTitle,
      checkpoints: row.checkpoints ?? [],
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    };
  }

  async create(dto: CreateCourseExportDto, user?: SessionUser) {
    const checkpoints = Array.isArray(dto.checkpoints) ? dto.checkpoints : [];
    if (checkpoints.length === 0) {
      throw new BadRequestException('En az bir parkur elemanı gerekli.');
    }

    const row = this.exportsRepo.create({
      title: String(dto.title || '').trim(),
      raceTitle: String(dto.raceTitle || '').trim(),
      checkpoints,
      createdById: user?.sub ?? null,
    });
    const saved = await this.exportsRepo.save(row);
    return this.serialize(saved);
  }

  async findOnePublic(id: string) {
    const row = await this.exportsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Parkur görünümü bulunamadı.');
    return this.serialize(row);
  }
}
