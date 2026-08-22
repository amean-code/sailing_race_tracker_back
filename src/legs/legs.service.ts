import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Leg } from '../entities/leg.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Trophy } from '../entities/trophy.entity';
import { User } from '../entities/user.entity';
import {
  LegKindEnum,
  NotificationEventEnum,
  RaceStatusEnum,
  UserRoleEnum,
} from '../common/constants';
import { SessionUser } from '../common/decorators';
import { serializeLeg, LegLike } from '../common/utils/serialize-leg';
import { serializeRace } from '../common/utils/serialize-race';
import {
  CreateLegDto,
  CreateLegRaceDto,
  CreateRaceUnderLegDto,
  UpdateLegDto,
} from './dto/leg.dto';
import { RaceApplicationDto } from '../races/dto/race.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class LegsService {
  constructor(
    @InjectRepository(Leg)
    private readonly legsRepo: Repository<Leg>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Trophy)
    private readonly trophiesRepo: Repository<Trophy>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async resolveCommitteeId(committeeId: string): Promise<string> {
    const referee = await this.usersRepo.findOne({ where: { id: committeeId } });
    if (!referee || referee.role !== UserRoleEnum.COMMITTEE) {
      throw new BadRequestException('Geçerli bir hakem seçilmelidir.');
    }
    return referee.id;
  }

  private assertAdminOwns(leg: Leg, user: SessionUser) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) return;
    if (user.role === UserRoleEnum.ADMIN && leg.createdById !== user.sub) {
      throw new ForbiddenException('Bu ayak size ait değil.');
    }
  }

  private assertCanManage(leg: Leg, user: SessionUser) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) return;
    if (user.role === UserRoleEnum.COMMITTEE) {
      if (leg.assignedCommitteeId !== user.sub) {
        throw new ForbiddenException('Bu ayak size atanmamış.');
      }
      return;
    }
    this.assertAdminOwns(leg, user);
  }

  private async withRaces(leg: Leg) {
    const races = await this.racesRepo.find({
      where: { legId: leg.id },
      relations: ['course'],
      order: { raceOrder: 'ASC', startDate: 'ASC', createdAt: 'ASC' },
    });
    const applicationCount = await this.applicationsRepo.count({ where: { legId: leg.id } });
    return serializeLeg({
      ...leg,
      applicationCount,
      races,
      trophy: leg.trophy
        ? { id: leg.trophy.id, title: leg.trophy.title }
        : leg.trophyId
          ? { id: leg.trophyId, title: '' }
          : null,
    } as LegLike);
  }

  async findAllManage(user: SessionUser) {
    const where: Record<string, unknown> = {};
    if (user.role === UserRoleEnum.COMMITTEE) {
      where.assignedCommitteeId = user.sub;
    } else if (user.role === UserRoleEnum.ADMIN) {
      where.createdById = user.sub;
    }

    const legs = await this.legsRepo.find({
      where,
      relations: ['trophy'],
      order: { startDate: 'ASC', createdAt: 'DESC' },
    });
    return Promise.all(legs.map((leg) => this.withRaces(leg)));
  }

  async findPublic() {
    const legs = await this.legsRepo.find({
      where: {
        status: In([
          RaceStatusEnum.OPEN,
          RaceStatusEnum.IN_PROGRESS,
          RaceStatusEnum.FINISHED,
        ]),
        kind: In([LegKindEnum.REGATA, LegKindEnum.SINGLE]),
      },
      relations: ['trophy'],
      order: { startDate: 'ASC' },
    });
    return Promise.all(legs.map((leg) => this.withRaces(leg)));
  }

  async findOne(id: string, user?: SessionUser) {
    const leg = await this.legsRepo.findOne({
      where: { id },
      relations: ['trophy'],
    });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');
    if (user) this.assertCanManage(leg, user);
    return this.withRaces(leg);
  }

  async findOnePublic(id: string) {
    const leg = await this.legsRepo.findOne({
      where: { id },
      relations: ['trophy'],
    });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');
    return this.withRaces(leg);
  }

  private defaultRaceTitle(order: number) {
    return `Yarış ${order}`;
  }

  private async createRaceForLeg(
    leg: Leg,
    dto: CreateLegRaceDto | CreateRaceUnderLegDto,
    createdById: string,
    raceOrder: number,
  ) {
    const race = this.racesRepo.create({
      title: dto.title?.trim() || this.defaultRaceTitle(raceOrder),
      description: dto.description ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : leg.startDate,
      endDate: dto.endDate ? new Date(dto.endDate) : leg.endDate,
      status: dto.status ?? RaceStatusEnum.OPEN,
      legId: leg.id,
      raceOrder,
      courseId: null,
      courseIds: [],
      raceState: dto.raceState ?? {},
      createdById,
    });
    return this.racesRepo.save(race);
  }

  async create(dto: CreateLegDto, user: SessionUser) {
    const kind = dto.kind ?? LegKindEnum.REGATA;
    if (kind === LegKindEnum.TROFE_LEG) {
      throw new BadRequestException(
        'Trofe ayağı oluşturmak için POST /trophies/:id/legs kullanın.',
      );
    }

    const assignedCommitteeId = await this.resolveCommitteeId(dto.assignedCommitteeId);
    const raceDrafts = dto.races?.length
      ? dto.races
      : [{ title: this.defaultRaceTitle(1) }];

    if (kind === LegKindEnum.SINGLE && raceDrafts.length > 1) {
      throw new BadRequestException('Tek yarış en fazla 1 yarış içerebilir.');
    }

    const leg = this.legsRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location?.trim() ?? '',
      venue: dto.venue ?? null,
      organizer: dto.organizer ?? null,
      boatClass: dto.boatClass ?? null,
      kind,
      status: dto.status ?? RaceStatusEnum.OPEN,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      registrationDeadline: dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : null,
      capacity: dto.capacity ?? 30,
      assignedCommitteeId,
      trophyId: null,
      legOrder: null,
      createdById: user.sub,
    });
    const saved = await this.legsRepo.save(leg);

    for (let i = 0; i < raceDrafts.length; i += 1) {
      await this.createRaceForLeg(saved, raceDrafts[i], user.sub, i + 1);
    }

    this.eventEmitter.emit('leg.created', {
      legId: saved.id,
      userId: user.sub,
      description: `Ayak oluşturuldu: ${saved.title}`,
    });

    return this.withRaces(saved);
  }

  async update(id: string, dto: UpdateLegDto, user: SessionUser) {
    const leg = await this.legsRepo.findOne({ where: { id }, relations: ['trophy'] });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');

    if (user.role === UserRoleEnum.COMMITTEE) {
      this.assertCanManage(leg, user);
      const blocked = [
        'title',
        'description',
        'location',
        'venue',
        'organizer',
        'boatClass',
        'startDate',
        'endDate',
        'registrationDeadline',
        'capacity',
        'assignedCommitteeId',
        'legOrder',
      ] as const;
      if (blocked.some((key) => dto[key] !== undefined)) {
        throw new ForbiddenException('Hakem ayak bilgilerini düzenleyemez.');
      }
    } else {
      this.assertAdminOwns(leg, user);
    }

    if (dto.title !== undefined) leg.title = dto.title;
    if (dto.description !== undefined) leg.description = dto.description ?? null;
    if (dto.location !== undefined) leg.location = dto.location;
    if (dto.venue !== undefined) leg.venue = dto.venue ?? null;
    if (dto.organizer !== undefined) leg.organizer = dto.organizer ?? null;
    if (dto.boatClass !== undefined) leg.boatClass = dto.boatClass ?? null;
    if (dto.status !== undefined) leg.status = dto.status;
    if (dto.startDate !== undefined) {
      leg.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      leg.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    if (dto.registrationDeadline !== undefined) {
      leg.registrationDeadline = dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : null;
    }
    if (dto.capacity !== undefined) leg.capacity = dto.capacity;
    if (dto.assignedCommitteeId !== undefined && dto.assignedCommitteeId) {
      leg.assignedCommitteeId = await this.resolveCommitteeId(dto.assignedCommitteeId);
    }
    if (dto.legOrder !== undefined) leg.legOrder = dto.legOrder;

    await this.legsRepo.save(leg);
    return this.withRaces(leg);
  }

  async remove(id: string, user: SessionUser) {
    const leg = await this.legsRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');
    this.assertAdminOwns(leg, user);
    await this.legsRepo.remove(leg);
    return { ok: true };
  }

  async addRace(legId: string, dto: CreateRaceUnderLegDto, user: SessionUser) {
    const leg = await this.legsRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');
    this.assertAdminOwns(leg, user);

    const existingCount = await this.racesRepo.count({ where: { legId } });
    if (leg.kind === LegKindEnum.SINGLE && existingCount >= 1) {
      throw new BadRequestException('Tek yarış en fazla 1 yarış içerebilir.');
    }

    let raceOrder = dto.raceOrder;
    if (raceOrder == null) {
      const existing = await this.racesRepo.find({
        where: { legId },
        select: ['raceOrder'],
      });
      const maxOrder = existing.reduce((max, r) => Math.max(max, r.raceOrder ?? 0), 0);
      raceOrder = maxOrder + 1;
    }

    const saved = await this.createRaceForLeg(leg, dto, user.sub, raceOrder);
    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_CREATED, {
      raceId: saved.id,
      raceTitle: saved.title,
      raceLocation: leg.location,
      raceStatus: saved.status,
    });
    this.eventEmitter.emit('race.created', {
      raceId: saved.id,
      userId: user.sub,
      description: `Yarış oluşturuldu: ${leg.title} / ${saved.title}`,
    });

    return serializeRace({ ...saved, leg: { id: leg.id, title: leg.title, kind: leg.kind } });
  }

  async createTrophyLeg(
    trophyId: string,
    dto: CreateLegDto & { legOrder?: number },
    user: SessionUser,
  ) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yönetici yetkisi gerekli');
    }
    if (user.role === UserRoleEnum.ADMIN && trophy.createdById !== user.sub) {
      throw new ForbiddenException('Bu trofe size ait değil.');
    }

    const existingCount = await this.legsRepo.count({ where: { trophyId } });
    if (trophy.plannedLegCount != null && existingCount >= trophy.plannedLegCount) {
      trophy.plannedLegCount = existingCount + 1;
      await this.trophiesRepo.save(trophy);
    } else if (trophy.plannedLegCount == null) {
      trophy.plannedLegCount = existingCount + 1;
      await this.trophiesRepo.save(trophy);
    }

    const assignedCommitteeId = await this.resolveCommitteeId(dto.assignedCommitteeId);

    let legOrder = dto.legOrder;
    if (legOrder == null) {
      const existing = await this.legsRepo.find({
        where: { trophyId },
        select: ['legOrder'],
      });
      const maxOrder = existing.reduce((max, l) => Math.max(max, l.legOrder ?? 0), 0);
      legOrder = maxOrder + 1;
    }

    const raceDrafts = dto.races?.length
      ? dto.races
      : [{ title: this.defaultRaceTitle(1) }];

    const leg = this.legsRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location?.trim() ?? trophy.location ?? '',
      venue: dto.venue ?? trophy.venue,
      organizer: dto.organizer ?? trophy.organizer,
      boatClass: dto.boatClass ?? trophy.boatClass,
      kind: LegKindEnum.TROFE_LEG,
      status: dto.status ?? RaceStatusEnum.OPEN,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      registrationDeadline: dto.registrationDeadline
        ? new Date(dto.registrationDeadline)
        : null,
      capacity: dto.capacity ?? 30,
      assignedCommitteeId,
      trophyId,
      legOrder,
      createdById: user.sub,
    });
    const saved = await this.legsRepo.save(leg);

    for (let i = 0; i < raceDrafts.length; i += 1) {
      await this.createRaceForLeg(saved, raceDrafts[i], user.sub, i + 1);
    }

    this.eventEmitter.emit('leg.created', {
      legId: saved.id,
      userId: user.sub,
      description: `Trofe ayağı oluşturuldu: ${trophy.title} / ${saved.title}`,
    });

    return this.withRaces({ ...saved, trophy } as Leg);
  }

  async submitApplication(legId: string, dto: RaceApplicationDto, user?: SessionUser) {
    const leg = await this.legsRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException('Ayak bulunamadı');

    const enriched = await this.withRaces(leg);
    if (!enriched.registrationOpen) {
      throw new BadRequestException('Bu ayak için kayıt kapatılmış');
    }

    const email = dto.email.toLowerCase();
    const existing = await this.applicationsRepo.findOne({
      where: { legId, email },
    });
    if (existing) {
      throw new ConflictException('Bu e-posta ile zaten başvurdunuz');
    }

    const application = this.applicationsRepo.create({
      legId,
      name: dto.name,
      email,
      phone: dto.phone ?? null,
      boatName: dto.boatName,
      sailNumber: dto.sailNumber,
      club: dto.club ?? null,
      notes: dto.notes ?? null,
      crewMembers: dto.crewMembers ?? null,
      userId: user?.sub ?? null,
    });
    const saved = await this.applicationsRepo.save(application);

    this.notificationsService.dispatchAsync(
      NotificationEventEnum.APPLICATION_SUBMITTED,
      {
        raceTitle: leg.title,
        raceLocation: leg.location,
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
      legId: saved.legId,
      name: saved.name,
      email: saved.email,
      createdAt: saved.createdAt.toISOString(),
    };
  }
}
