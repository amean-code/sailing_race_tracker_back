import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Boat } from '../entities/boat.entity';
import { Race } from '../entities/race.entity';
import { ApplicationStatusEnum } from '../common/constants';
import { UpdateApplicationDto } from './dto/application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
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

  private pickColor(index: number): string {
    const colors = [
      '#ef4444', // Red
      '#f97316', // Orange
      '#f59e0b', // Amber
      '#10b981', // Emerald
      '#06b6d4', // Cyan
      '#3b82f6', // Blue
      '#6366f1', // Indigo
      '#8b5cf6', // Violet
      '#ec4899', // Pink
    ];
    return colors[index % colors.length];
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

      if (dto.status === ApplicationStatusEnum.CHECKED_IN) {
        // If status changes to CHECKED_IN, make sure a Boat is created
        let boat = await this.boatsRepo.findOne({ where: { applicationId: app.id } });
        if (!boat) {
          const existingCount = await this.boatsRepo.count({
            where: { raceId: app.raceId, status: 'registered' },
          });
          
          boat = this.boatsRepo.create({
            name: app.boatName,
            sailNumber: app.sailNumber,
            competitorName: app.name,
            applicationId: app.id,
            raceId: app.raceId,
            courseId: app.race?.courseId ?? null,
            status: 'registered',
            displayColor: this.pickColor(existingCount),
          });
          await this.boatsRepo.save(boat);
          app.boatId = boat.id;
          app.checkedInAt = new Date();
        }
      }
    }
    if (dto.notes !== undefined) app.notes = dto.notes;

    const saved = await this.applicationsRepo.save(app);
    return this.serialize(saved);
  }
}
