import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CourseStatusEnum, UserRoleEnum, RaceStatusEnum } from '../common/constants';
import { SessionUser } from '../common/decorators';

import { Race } from '../entities/race.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
  ) { }

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

  async findAll(user?: SessionUser) {
    const where: any = {};
    if (user?.role === UserRoleEnum.COMMITTEE) {
      where.createdById = user.sub;
    }

    const courses = await this.coursesRepo.find({
      where,
      relations: ['createdBy', 'races'],
      order: { createdAt: 'DESC' },
    });
    return courses.map((c) => this.serialize(c));
  }

  async findOne(id: string, user?: SessionUser) {
    const where: any = { id };
    if (user?.role === UserRoleEnum.COMMITTEE) {
      where.createdById = user.sub;
    }

    const course = await this.coursesRepo.findOne({
      where,
      relations: ['createdBy', 'races'],
    });
    if (!course) throw new NotFoundException('Parkur bulunamadı veya erişim izniniz yok');
    return this.serialize(course);
  }

  async create(dto: CreateCourseDto, user?: SessionUser) {
    let initialStatus = CourseStatusEnum.ACTIVE;

    const course = this.coursesRepo.create({
      name: dto.name,
      checkpoints: dto.checkpoints as unknown as Record<string, unknown>[],
      createdById: user?.sub ?? null,
      status: initialStatus,
    });
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id, user);
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
    return this.findOne(saved.id, user);
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
      // Check if any linked race is already started/closed
      const activeRaces = course.races.filter(
        (r) =>
          r.status === RaceStatusEnum.IN_PROGRESS ||
          r.status === RaceStatusEnum.FINISHED ||
          r.status === RaceStatusEnum.SUSPENDED
      );
      if (activeRaces.length > 0) {
        const raceListStr = activeRaces.map((r) => `"${r.title}" (${r.status === RaceStatusEnum.FINISHED ? 'Bitti' : r.status === RaceStatusEnum.IN_PROGRESS ? 'Devam Ediyor' : 'Askıya Alınmış'})`).join(', ');
        throw new BadRequestException(
          `Bu parkur şu yarışlarda kullanıldığı (ve yarışlar başladığı/bittiği) için silinemez: ${raceListStr}`
        );
      }
      // Nullify courseId for all linked non-started (OPEN/DRAFT) races
      await this.coursesRepo.manager.update(Race, { courseId: id }, { courseId: null });
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
    }

    course.status = status;
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id, user);
  }

  async transferOwner(id: string, newOwnerId: string, user?: SessionUser) {
    if (user?.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Sadece Super Admin parkur devredebilir.');
    }
    const course = await this.coursesRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Parkur bulunamadı');

    course.createdById = newOwnerId;
    const saved = await this.coursesRepo.save(course);
    return this.findOne(saved.id, user);
  }
}
