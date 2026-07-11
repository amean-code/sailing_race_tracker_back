import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { Boat } from '../entities/boat.entity';
import { ApplicationStatusEnum } from '../common/constants';
import { TrackPointsService } from '../track-points/track-points.service';

const FLEET_COLORS = [
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
];

@Injectable()
export class RaceFleetService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    private readonly trackPointsService: TrackPointsService,
  ) {}

  private serializeApplication(app: RaceApplication) {
    return {
      id: app.id,
      raceId: app.raceId,
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

  private serializeBoat(boat: Boat) {
    return {
      id: boat.id,
      name: boat.name,
      status: boat.status,
      userId: boat.userId,
      courseId: boat.courseId,
      raceId: boat.raceId,
      applicationId: boat.applicationId,
      sailNumber: boat.sailNumber,
      displayColor: boat.displayColor,
      competitorName: boat.competitorName,
      createdAt: boat.createdAt.toISOString(),
      updatedAt: boat.updatedAt.toISOString(),
    };
  }

  private pickColor(index: number) {
    return FLEET_COLORS[index % FLEET_COLORS.length];
  }

  async getCompetitors(raceId: string) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const applications = await this.applicationsRepo.find({
      where: { raceId },
      relations: ['boat'],
      order: { createdAt: 'ASC' },
    });

    const latestByBoat = await this.trackPointsService.findLatestByRace(raceId);

    return {
      competitors: applications.map((app, index) => {
        const boat = app.boat ? this.serializeBoat(app.boat) : null;
        const position = app.boatId ? latestByBoat.get(app.boatId) ?? null : null;
        return {
          application: this.serializeApplication(app),
          boat,
          position,
          displayColor: boat?.displayColor ?? this.pickColor(index),
        };
      }),
    };
  }

  async checkIn(raceId: string, applicationId: string) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const app = await this.applicationsRepo.findOne({
      where: { id: applicationId, raceId },
      relations: ['boat'],
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');

    if (app.status === ApplicationStatusEnum.CHECKED_IN && app.boat) {
      return {
        application: this.serializeApplication(app),
        boat: this.serializeBoat(app.boat),
      };
    }

    if (app.status !== ApplicationStatusEnum.APPROVED) {
      throw new BadRequestException('Check-in için başvuru onaylanmış olmalı');
    }

    const existingCount = await this.applicationsRepo.count({
      where: { raceId, status: ApplicationStatusEnum.CHECKED_IN },
    });

    let boat = app.boat;
    if (!boat) {
      boat = this.boatsRepo.create({
        name: app.boatName,
        sailNumber: app.sailNumber,
        competitorName: app.name,
        applicationId: app.id,
        raceId,
        courseId: race.courseId ?? null,
        status: 'registered',
        displayColor: this.pickColor(existingCount),
      });
      boat = await this.boatsRepo.save(boat);
    }

    app.status = ApplicationStatusEnum.CHECKED_IN;
    app.boatId = boat.id;
    app.checkedInAt = new Date();
    await this.applicationsRepo.save(app);

    const saved = await this.applicationsRepo.findOne({
      where: { id: app.id },
      relations: ['boat'],
    });

    return {
      application: this.serializeApplication(saved!),
      boat: this.serializeBoat(saved!.boat!),
    };
  }
}
