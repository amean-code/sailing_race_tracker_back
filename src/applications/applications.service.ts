import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { ApplicationStatusEnum } from '../common/constants';
import { UpdateApplicationDto } from './dto/application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
  ) {}

  serialize(app: RaceApplication) {
    return {
      id: app.id,
      raceId: app.raceId,
      raceTitle: app.race?.title ?? '',
      name: app.name,
      email: app.email,
      phone: app.phone,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      club: app.club,
      notes: app.notes,
      status: app.status,
      boatId: app.boatId,
      userId: app.userId,
      checkedInAt: app.checkedInAt?.toISOString() ?? null,
      finishPosition: app.finishPosition,
      fleetSize: app.fleetSize,
      createdAt: app.createdAt.toISOString(),
    };
  }

  async findAll(raceId?: string) {
    const applications = await this.applicationsRepo.find({
      where: raceId ? { raceId } : {},
      relations: ['race'],
      order: { createdAt: 'DESC' },
    });
    return applications.map((app) => this.serialize(app));
  }

  async update(id: string, dto: UpdateApplicationDto) {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['race'],
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');

    if (dto.status !== undefined) {
      if (app.status === ApplicationStatusEnum.CHECKED_IN && dto.status !== ApplicationStatusEnum.CHECKED_IN) {
        throw new BadRequestException('Check-in yapılmış başvurunun durumu değiştirilemez');
      }
      app.status = dto.status;
    }
    if (dto.notes !== undefined) app.notes = dto.notes;

    const saved = await this.applicationsRepo.save(app);
    return this.serialize(saved);
  }
}
