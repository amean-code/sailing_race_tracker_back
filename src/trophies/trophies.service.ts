import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Trophy } from '../entities/trophy.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Course } from '../entities/course.entity';
import { User } from '../entities/user.entity';
import {
  ApplicationStatusEnum,
  NotificationEventEnum,
  RaceStatusEnum,
  RaceTypeEnum,
  TrophyStatusEnum,
  UserRoleEnum,
} from '../common/constants';
import { SessionUser } from '../common/decorators';
import { serializeRace, RaceLike } from '../common/utils/serialize-race';
import { CreateTrophyDto, CreateTrophyLegDto, UpdateTrophyDto } from './dto/trophy.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

function normalizeKey(sailNumber: string | null | undefined, email: string): string {
  const sail = (sailNumber || '').trim().toUpperCase();
  if (sail) return `sail:${sail}`;
  return `email:${email.trim().toLowerCase()}`;
}

function serializeTrophy(
  trophy: Trophy,
  legs: ReturnType<typeof serializeRace>[] = [],
) {
  return {
    id: trophy.id,
    title: trophy.title,
    description: trophy.description,
    location: trophy.location,
    venue: trophy.venue,
    organizer: trophy.organizer,
    boatClass: trophy.boatClass,
    status: String(trophy.status).toLowerCase(),
    startDate: trophy.startDate ? trophy.startDate.toISOString() : null,
    endDate: trophy.endDate ? trophy.endDate.toISOString() : null,
    plannedLegCount: trophy.plannedLegCount ?? null,
    createdById: trophy.createdById,
    createdAt: trophy.createdAt.toISOString(),
    updatedAt: trophy.updatedAt.toISOString(),
    legs,
    legCount: legs.length,
  };
}

@Injectable()
export class TrophiesService {
  constructor(
    @InjectRepository(Trophy)
    private readonly trophiesRepo: Repository<Trophy>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private assertOwner(trophy: Trophy, user: SessionUser) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yönetici yetkisi gerekli');
    }
  }

  private async resolveCommitteeId(committeeId: string): Promise<string> {
    const referee = await this.usersRepo.findOne({ where: { id: committeeId } });
    if (!referee || referee.role !== UserRoleEnum.COMMITTEE) {
      throw new BadRequestException('Geçerli bir hakem seçilmelidir.');
    }
    return referee.id;
  }

  private async serializeLegs(legs: Race[]) {
    const sorted = [...legs].sort((a, b) => {
      const ao = a.legOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.legOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
    return Promise.all(
      sorted.map(async (race) => {
        const applicationCount = await this.applicationsRepo.count({ where: { raceId: race.id } });
        return serializeRace({
          ...race,
          applicationCount,
          trophy: race.trophy
            ? { id: race.trophy.id, title: race.trophy.title }
            : race.trophyId
              ? { id: race.trophyId, title: '' }
              : null,
        } as RaceLike);
      }),
    );
  }

  private async withLegs(trophy: Trophy) {
    const legs = await this.racesRepo.find({
      where: { trophyId: trophy.id },
      relations: ['course', 'trophy'],
      order: { legOrder: 'ASC', startDate: 'ASC' },
    });
    return serializeTrophy(trophy, await this.serializeLegs(legs));
  }

  async findAllManage(user: SessionUser) {
    if (user.role === UserRoleEnum.COMMITTEE) {
      const assignedLegs = await this.racesRepo.find({
        where: {
          type: RaceTypeEnum.TROFE_LEG,
          assignedCommitteeId: user.sub,
        },
        select: ['trophyId'],
      });
      const trophyIds = [
        ...new Set(
          assignedLegs
            .map((r) => r.trophyId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (trophyIds.length === 0) return [];
      const trophies = await this.trophiesRepo.find({
        where: { id: In(trophyIds) },
        order: { createdAt: 'DESC' },
      });
      const results = await Promise.all(trophies.map((t) => this.withLegs(t)));
      return results;
    }

    const trophies = await this.trophiesRepo.find({
      order: { createdAt: 'DESC' },
    });
    return Promise.all(trophies.map((t) => this.withLegs(t)));
  }

  async findPublic() {
    const trophies = await this.trophiesRepo.find({
      where: {
        status: In([
          TrophyStatusEnum.OPEN,
          TrophyStatusEnum.IN_PROGRESS,
          TrophyStatusEnum.FINISHED,
        ]),
      },
      order: { createdAt: 'DESC' },
    });
    const results = await Promise.all(trophies.map((t) => this.withLegs(t)));
    return results.map((trophy) => ({
      ...trophy,
      legs: trophy.legs.filter((leg) =>
        ['open', 'in_progress', 'finished'].includes(String(leg.status).toLowerCase()),
      ),
    }));
  }

  async findOne(id: string, user?: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE) {
      const assignedCount = await this.racesRepo.count({
        where: {
          trophyId: id,
          assignedCommitteeId: user.sub,
          type: RaceTypeEnum.TROFE_LEG,
        },
      });
      if (assignedCount === 0) {
        throw new ForbiddenException('Bu trofede size atanmış ayak yok.');
      }
    }

    return this.withLegs(trophy);
  }

  async create(dto: CreateTrophyDto, createdById: string, user?: SessionUser) {
    if (dto.legs?.length && dto.plannedLegCount != null && dto.legs.length > dto.plannedLegCount) {
      throw new BadRequestException(
        `Planlanan ayak sayısı ${dto.plannedLegCount}; en fazla o kadar ayak ekleyebilirsiniz.`,
      );
    }

    const trophy = this.trophiesRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location,
      venue: dto.venue ?? null,
      organizer: dto.organizer ?? null,
      boatClass: dto.boatClass ?? null,
      status: dto.status ?? TrophyStatusEnum.OPEN,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      plannedLegCount: dto.plannedLegCount ?? null,
      createdById,
      assignedCommitteeId: null,
    });
    const saved = await this.trophiesRepo.save(trophy);

    if (dto.legs?.length && user) {
      for (let i = 0; i < dto.legs.length; i += 1) {
        const legDto = { ...dto.legs[i], legOrder: dto.legs[i].legOrder ?? i + 1 };
        await this.addLeg(saved.id, legDto, user);
      }
    }

    return this.withLegs(saved);
  }

  async update(id: string, dto: UpdateTrophyDto, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    if (dto.title !== undefined) trophy.title = dto.title;
    if (dto.description !== undefined) trophy.description = dto.description ?? null;
    if (dto.location !== undefined) trophy.location = dto.location;
    if (dto.venue !== undefined) trophy.venue = dto.venue ?? null;
    if (dto.organizer !== undefined) trophy.organizer = dto.organizer ?? null;
    if (dto.boatClass !== undefined) trophy.boatClass = dto.boatClass ?? null;
    if (dto.status !== undefined) trophy.status = dto.status;
    if (dto.startDate !== undefined) {
      trophy.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      trophy.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    if (dto.plannedLegCount !== undefined) {
      if (dto.plannedLegCount != null) {
        const currentLegs = await this.racesRepo.count({ where: { trophyId: id } });
        if (dto.plannedLegCount < currentLegs) {
          throw new BadRequestException(
            `Planlanan ayak sayısı mevcut ayak sayısından (${currentLegs}) küçük olamaz.`,
          );
        }
      }
      trophy.plannedLegCount = dto.plannedLegCount ?? null;
    }

    await this.trophiesRepo.save(trophy);
    return this.withLegs(trophy);
  }

  async remove(id: string, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const legCount = await this.racesRepo.count({ where: { trophyId: id } });
    if (legCount > 0) {
      throw new BadRequestException(
        'Trofe silinemez: önce tüm ayak yarışlarını silin.',
      );
    }
    await this.trophiesRepo.remove(trophy);
    return { ok: true };
  }

  async addLeg(trophyId: string, dto: CreateTrophyLegDto, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const existingCount = await this.racesRepo.count({ where: { trophyId } });
    if (trophy.plannedLegCount != null && existingCount >= trophy.plannedLegCount) {
      trophy.plannedLegCount = existingCount + 1;
      await this.trophiesRepo.save(trophy);
    } else if (trophy.plannedLegCount == null) {
      trophy.plannedLegCount = existingCount + 1;
      await this.trophiesRepo.save(trophy);
    }

    const assignedCommitteeId = await this.resolveCommitteeId(dto.assignedCommitteeId);

    if (dto.courseId) {
      const course = await this.coursesRepo.findOne({ where: { id: dto.courseId } });
      if (!course) throw new NotFoundException('Seçilen parkur bulunamadı.');
    }

    let legOrder = dto.legOrder;
    if (legOrder == null) {
      const existing = await this.racesRepo.find({
        where: { trophyId },
        select: ['legOrder'],
      });
      const maxOrder = existing.reduce((max, r) => Math.max(max, r.legOrder ?? 0), 0);
      legOrder = maxOrder + 1;
    }

    const race = this.racesRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      location: dto.location ?? trophy.location,
      venue: dto.venue ?? trophy.venue,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      registrationDeadline: new Date(dto.registrationDeadline),
      boatClass: dto.boatClass ?? trophy.boatClass,
      capacity: dto.capacity ?? 30,
      status: dto.status ?? RaceStatusEnum.OPEN,
      organizer: dto.organizer ?? trophy.organizer,
      courseId: dto.courseId ?? null,
      courseIds: dto.courseIds ?? [],
      raceState: dto.raceState ?? {},
      createdById: user.sub,
      assignedCommitteeId,
      type: RaceTypeEnum.TROFE_LEG,
      trophyId,
      legOrder,
    });

    const saved = await this.racesRepo.save(race);
    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_CREATED, {
      raceId: saved.id,
      raceTitle: saved.title,
      raceLocation: saved.location,
      raceStatus: saved.status,
    });
    this.eventEmitter.emit('race.created', {
      raceId: saved.id,
      userId: user.sub,
      description: `Trofe ayağı oluşturuldu: ${trophy.title} / ${saved.title}`,
    });

    const applicationCount = await this.applicationsRepo.count({ where: { raceId: saved.id } });
    return serializeRace({
      ...saved,
      applicationCount,
      trophy: { id: trophy.id, title: trophy.title },
    } as RaceLike);
  }

  async getStandings(trophyId: string) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');

    const legs = await this.racesRepo.find({
      where: { trophyId },
      order: { legOrder: 'ASC', startDate: 'ASC' },
    });

    if (legs.length === 0) {
      return {
        trophy: { id: trophy.id, title: trophy.title },
        legs: [],
        standings: [],
      };
    }

    const legIds = legs.map((l) => l.id);
    const applications = await this.applicationsRepo.find({
      where: { raceId: In(legIds) },
    });

    const appsByRace = new Map<string, RaceApplication[]>();
    for (const app of applications) {
      const list = appsByRace.get(app.raceId) ?? [];
      list.push(app);
      appsByRace.set(app.raceId, list);
    }

    type Competitor = {
      key: string;
      sailNumber: string;
      boatName: string;
      name: string;
      email: string;
      club: string | null;
      legPoints: Record<string, number | null>;
      legResults: Record<
        string,
        { points: number; finishPosition: number | null; status: string; scored: boolean }
      >;
      totalPoints: number;
      racesScored: number;
    };

    const competitors = new Map<string, Competitor>();

    const ensureCompetitor = (app: RaceApplication): Competitor => {
      const key = normalizeKey(app.sailNumber, app.email);
      let c = competitors.get(key);
      if (!c) {
        c = {
          key,
          sailNumber: app.sailNumber,
          boatName: app.boatName,
          name: app.name,
          email: app.email,
          club: app.club,
          legPoints: {},
          legResults: {},
          totalPoints: 0,
          racesScored: 0,
        };
        competitors.set(key, c);
      } else {
        if (!c.sailNumber && app.sailNumber) c.sailNumber = app.sailNumber;
        if (app.boatName) c.boatName = app.boatName;
        if (app.name) c.name = app.name;
        if (app.club) c.club = app.club;
      }
      return c;
    };

    for (const leg of legs) {
      const apps = appsByRace.get(leg.id) ?? [];
      const fleetSize =
        apps.find((a) => a.fleetSize != null)?.fleetSize ??
        apps.filter((a) =>
          ![ApplicationStatusEnum.WITHDRAWN].includes(a.status as ApplicationStatusEnum),
        ).length;
      const dnsPoints = Math.max(fleetSize, 1) + 1;
      const isFinished = leg.status === RaceStatusEnum.FINISHED;

      for (const app of apps) {
        if (app.status === ApplicationStatusEnum.WITHDRAWN) continue;
        const c = ensureCompetitor(app);
        let points: number;
        let scored = false;

        if (app.finishPosition != null) {
          points = app.finishPosition;
          scored = true;
        } else if (
          app.status === ApplicationStatusEnum.DNS ||
          app.status === ApplicationStatusEnum.DNF ||
          app.status === ApplicationStatusEnum.DSQ ||
          isFinished
        ) {
          points = dnsPoints;
          scored =
            isFinished ||
            app.status === ApplicationStatusEnum.DNS ||
            app.status === ApplicationStatusEnum.DNF ||
            app.status === ApplicationStatusEnum.DSQ;
        } else {
          points = 0;
          scored = false;
        }

        c.legPoints[leg.id] = scored ? points : null;
        c.legResults[leg.id] = {
          points: scored ? points : 0,
          finishPosition: app.finishPosition,
          status: String(app.status),
          scored,
        };
      }
    }

    // For finished legs where a competitor did not enter: DNS points
    for (const leg of legs) {
      if (leg.status !== RaceStatusEnum.FINISHED) continue;
      const apps = appsByRace.get(leg.id) ?? [];
      const fleetSize =
        apps.find((a) => a.fleetSize != null)?.fleetSize ??
        Math.max(apps.length, competitors.size, 1);
      const dnsPoints = fleetSize + 1;

      for (const c of competitors.values()) {
        if (c.legResults[leg.id]) continue;
        c.legPoints[leg.id] = dnsPoints;
        c.legResults[leg.id] = {
          points: dnsPoints,
          finishPosition: null,
          status: ApplicationStatusEnum.DNS,
          scored: true,
        };
      }
    }

    const standings = Array.from(competitors.values()).map((c) => {
      let total = 0;
      let racesScored = 0;
      for (const leg of legs) {
        const result = c.legResults[leg.id];
        if (result?.scored) {
          total += result.points;
          racesScored += 1;
        }
      }
      return {
        sailNumber: c.sailNumber,
        boatName: c.boatName,
        name: c.name,
        email: c.email,
        club: c.club,
        totalPoints: total,
        racesScored,
        legPoints: Object.fromEntries(
          legs.map((leg) => [leg.id, c.legPoints[leg.id] ?? null]),
        ),
        legResults: c.legResults,
      };
    });

    standings.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
      if (a.racesScored !== b.racesScored) return b.racesScored - a.racesScored;
      return a.sailNumber.localeCompare(b.sailNumber);
    });

    return {
      trophy: { id: trophy.id, title: trophy.title },
      scoring: {
        system: 'low_point',
        description:
          'Her ayakta bitiş pozisyonu puan olarak sayılır. DNS/DNF/DSQ ve katılmayanlar için filo sayısı + 1. En düşük toplam üsttedir.',
      },
      legs: legs.map((leg) => ({
        id: leg.id,
        title: leg.title,
        legOrder: leg.legOrder,
        status: String(leg.status).toLowerCase(),
        startDate: leg.startDate.toISOString(),
      })),
      standings: standings.map((row, index) => ({
        rank: index + 1,
        ...row,
      })),
    };
  }
}
