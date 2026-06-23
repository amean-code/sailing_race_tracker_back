import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
  ) {}

  serialize(course: Course) {
    return {
      id: course.id,
      name: course.name,
      checkpoints: course.checkpoints,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }

  async findAll() {
    const courses = await this.coursesRepo.find({ order: { updatedAt: 'DESC' } });
    return courses.map((c) => this.serialize(c));
  }

  async findOne(id: string) {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Parkur bulunamadı');
    return this.serialize(course);
  }

  async create(dto: CreateCourseDto) {
    const course = this.coursesRepo.create({
      name: dto.name,
      checkpoints: dto.checkpoints as unknown as Record<string, unknown>[],
    });
    const saved = await this.coursesRepo.save(course);
    return this.serialize(saved);
  }

  async update(id: string, dto: UpdateCourseDto) {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Parkur bulunamadı');
    course.name = dto.name;
    course.checkpoints = dto.checkpoints as unknown as Record<string, unknown>[];
    const saved = await this.coursesRepo.save(course);
    return this.serialize(saved);
  }

  async remove(id: string) {
    const result = await this.coursesRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Parkur bulunamadı');
    return { ok: true };
  }
}
