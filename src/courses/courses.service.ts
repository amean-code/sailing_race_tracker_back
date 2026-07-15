import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CourseStatusEnum, UserRoleEnum } from '../common/constants';
import { SessionUser } from '../common/decorators';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
  ) {}

  serialize(course: Course & { raceCount?: number }) {
    return {
      id: course.id,
      name: course.name,
      checkpoints: course.checkpoints,
      checkpointCount: (course.checkpoints ?? []).length,
      status: course.status,
      createdById: course.createdById,
      createdByName: course.createdBy?.name ?? null,
      createdByEmail: course.createdBy?.email ?? null,
      raceCount: course.raceCount ?? course.races?.length ?? 0,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }

  async findAll() {
    const courses = await this.coursesRepo.find({
      relations: ['createdBy', 'races'],
      order: { updatedAt: 'DESC' },
    });
    return courses.map((c) => this.serialize(c));
  }

  async findOne(id: string) {
    const course = await this.coursesRepo.findOne({
      where: { id },
      relations: ['createdBy', 'races'],
    });
    if (!course) throw new NotFoundException('Parkur bulunamadı');
    return this.serialize(course);
  }

  async create(dto: CreateCourseDto, createdById?: string) {
    const course = this.coursesRepo.create({
      name: dto.name,
      checkpoints: dto.checkpoints as unknown as Record<string, unknown>[],
      createdById: createdById ?? null,
      status: CourseStatusEnum.DRAFT,
    });
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateCourseDto, user?: SessionUser) {
    const course = await this.coursesRepo.findOne({
      where: { id },
      relations: ['races'],
    });
    if (!course) throw new NotFoundException('Parkur bulunamadı');

    // Role-based restrictions
    if (user?.role === UserRoleEnum.COMMITTEE && course.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi oluşturduğunuz parkuru düzenleyebilirsiniz.');
    }

    course.name = dto.name;
    course.checkpoints = dto.checkpoints as unknown as Record<string, unknown>[];
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id);
  }

  async remove(id: string, user?: SessionUser) {
    const course = await this.coursesRepo.findOne({
      where: { id },
      relations: ['races'],
    });
    if (!course) throw new NotFoundException('Parkur bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE && course.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi oluşturduğunuz parkuru silebilirsiniz.');
    }

    if (course.races && course.races.length > 0) {
      throw new BadRequestException('Bu parkur bir veya daha fazla yarışta kullanıldığı için silinemez.');
    }

    await this.coursesRepo.remove(course);
    return { ok: true };
  }

  async updateStatus(id: string, status: CourseStatusEnum, user?: SessionUser) {
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Parkur bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE) {
      if (course.createdById !== user.sub) {
        throw new ForbiddenException('Sadece kendi parkurunuzun durumunu değiştirebilirsiniz.');
      }
      if (status !== CourseStatusEnum.PENDING && status !== CourseStatusEnum.DRAFT) {
        throw new ForbiddenException('Hakemler yalnızca parkuru onaya gönderebilir veya taslağa çekebilir.');
      }
    }

    course.status = status;
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id);
  }

  async transferOwner(id: string, newOwnerId: string, user?: SessionUser) {
    if (user?.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Sadece Super Admin parkur devredebilir.');
    }
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Parkur bulunamadı');

    course.createdById = newOwnerId;
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id);
  }
}
