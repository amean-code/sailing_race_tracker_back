import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RaceStatusEnum, NotificationEventEnum } from '../common/constants';
import { serializeRace, RaceLike } from '../common/utils/serialize-race';
import {
  CreateRaceDto,
  RaceApplicationDto,
  UpdateRaceDto,
} from './dto/race.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RacesService {
  constructor(
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async withCount(race: Race) {
    const applicationCount = await this.applicationsRepo.count({
      where: { raceId: race.id },
    });
    return serializeRace({ ...race, applicationCount } as RaceLike);
  }

  async findAllManage() {
    const races = await this.racesRepo.find({
      relations: ['course'],
      order: { startDate: 'ASC' },
    });
    return Promise.all(races.map((r) => this.withCount(r)));
  }

  async findPublic() {
    const races = await this.racesRepo.find({
      where: [
        { status: RaceStatusEnum.OPEN },
        { status: RaceStatusEnum.IN_PROGRESS },
      ],
      relations: ['course'],
      order: { startDate: 'ASC' },
    });
    return Promise.all(races.map((r) => this.withCount(r)));
  }

  async findOne(id: string) {
    const race = await this.racesRepo.findOne({
      where: { id },
      relations: ['course'],
    });
    if (!race) throw new NotFoundException('Yarış bulunamadı');
    return this.withCount(race);
  }

  async create(dto: CreateRaceDto, createdById: string) {
    const race = this.racesRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location,
      venue: dto.venue ?? null,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      registrationDeadline: new Date(dto.registrationDeadline),
      boatClass: dto.boatClass ?? null,
      capacity: dto.capacity ?? 30,
      status: dto.status ?? RaceStatusEnum.OPEN,
      organizer: dto.organizer ?? null,
      courseId: dto.courseId ?? null,
      raceState: dto.raceState ?? {},
      createdById,
    });
    const saved = await this.racesRepo.save(race);
    const result = await this.findOne(saved.id);
    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_CREATED, {
      raceTitle: saved.title,
      raceLocation: saved.location,
      raceStatus: saved.status,
    });
    return result;
  }

  private applyStatusChange(race: Race, nextStatus: RaceStatusEnum): void {
    const previous = race.status;

    if (nextStatus === RaceStatusEnum.SUSPENDED && previous !== RaceStatusEnum.SUSPENDED) {
      race.raceState = {
        ...(race.raceState ?? {}),
        statusBeforeSuspend: previous,
      };
      race.status = RaceStatusEnum.SUSPENDED;
      return;
    }

    if (previous === RaceStatusEnum.SUSPENDED && nextStatus !== RaceStatusEnum.SUSPENDED) {
      race.status = nextStatus;
      const { statusBeforeSuspend: _removed, ...rest } = race.raceState ?? {};
      race.raceState = rest;
      return;
    }

    race.status = nextStatus;
  }

  async update(id: string, dto: UpdateRaceDto) {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const previousStatus = race.status;

    if (dto.title !== undefined) race.title = dto.title;
    if (dto.description !== undefined) race.description = dto.description ?? null;
    if (dto.location !== undefined) race.location = dto.location;
    if (dto.venue !== undefined) race.venue = dto.venue ?? null;
    if (dto.startDate !== undefined) race.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) race.endDate = new Date(dto.endDate);
    if (dto.registrationDeadline !== undefined) {
      race.registrationDeadline = new Date(dto.registrationDeadline);
    }
    if (dto.boatClass !== undefined) race.boatClass = dto.boatClass ?? null;
    if (dto.capacity !== undefined) race.capacity = dto.capacity;
    if (dto.status !== undefined) this.applyStatusChange(race, dto.status);
    if (dto.organizer !== undefined) race.organizer = dto.organizer ?? null;
    if (dto.courseId !== undefined) race.courseId = dto.courseId ?? null;
    if (dto.raceState !== undefined) {
      race.raceState = { ...(race.raceState ?? {}), ...(dto.raceState ?? {}) };
    }

    const saved = await this.racesRepo.save(race);
    const result = await this.findOne(saved.id);

    const ctx = {
      raceTitle: saved.title,
      raceLocation: saved.location,
      raceStatus: saved.status,
    };

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_STATUS_CHANGED, ctx);
    } else {
      this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_UPDATED, ctx);
    }

    return result;
  }

  async remove(id: string) {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış silinemedi');

    const ctx = {
      raceTitle: race.title,
      raceLocation: race.location,
    };

    const result = await this.racesRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Yarış silinemedi');

    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_DELETED, ctx);
    return { ok: true };
  }

  async submitApplication(raceId: string, dto: RaceApplicationDto) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const enriched = await this.withCount(race);
    if (!enriched.registrationOpen) {
      throw new BadRequestException('Bu yarış için kayıt kapatılmış');
    }

    const email = dto.email.toLowerCase();
    const existing = await this.applicationsRepo.findOne({
      where: { raceId, email },
    });
    if (existing) {
      throw new ConflictException('Bu e-posta ile zaten başvurdunuz');
    }

    const application = this.applicationsRepo.create({
      raceId,
      name: dto.name,
      email,
      phone: dto.phone ?? null,
      boatName: dto.boatName,
      sailNumber: dto.sailNumber,
      club: dto.club ?? null,
      notes: dto.notes ?? null,
    });
    const saved = await this.applicationsRepo.save(application);

    this.notificationsService.dispatchAsync(
      NotificationEventEnum.APPLICATION_SUBMITTED,
      {
        raceTitle: race.title,
        raceLocation: race.location,
        applicantName: saved.name,
        boatName: saved.boatName,
        sailNumber: saved.sailNumber,
      },
      {
        email: saved.email,
        phone: saved.phone,
        name: saved.name,
      },
    );

    return {
      id: saved.id,
      raceId: saved.raceId,
      name: saved.name,
      email: saved.email,
      createdAt: saved.createdAt.toISOString(),
    };
  }
}
