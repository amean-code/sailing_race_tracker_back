import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Trophy } from '../entities/trophy.entity';
import { Leg } from '../entities/leg.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RaceResult } from '../entities/race-result.entity';
import {
  ApplicationStatusEnum,
  LegKindEnum,
  RaceResultStatusEnum,
  RaceStatusEnum,
  TrophyStatusEnum,
  UserRoleEnum,
} from '../common/constants';
import { SessionUser } from '../common/decorators';
import { serializeLeg, LegLike } from '../common/utils/serialize-leg';
import { CreateTrophyDto, CreateTrophyLegDto, CreateTrophyGroupDto, UpdateTrophyDto, UpdateTrophyGroupDto } from './dto/trophy.dto';
import { LegsService } from '../legs/legs.service';
import { TrophyGroup } from '../entities/trophy-group.entity';

function normalizeKey(sailNumber: string | null | undefined, email: string): string {
  const sail = (sailNumber || '').trim().toUpperCase();
  if (sail) return `sail:${sail}`;
  return `email:${email.trim().toLowerCase()}`;
}

function serializeTrophy(
  trophy: Trophy,
  legs: ReturnType<typeof serializeLeg>[] = [],
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
    maxGroupCount: trophy.maxGroupCount ?? null,
    createdById: trophy.createdById,
    createdAt: trophy.createdAt.toISOString(),
    updatedAt: trophy.updatedAt.toISOString(),
    legs,
    legCount: legs.length,
  };
}

function serializeTrophyGroup(group: TrophyGroup, memberCount = 0) {
  return {
    id: group.id,
    trophyId: group.trophyId,
    name: group.name,
    sortOrder: group.sortOrder,
    capacity: group.capacity ?? null,
    memberCount,
    isFull:
      group.capacity != null && memberCount >= group.capacity,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

@Injectable()
export class TrophiesService {
  constructor(
    @InjectRepository(Trophy)
    private readonly trophiesRepo: Repository<Trophy>,
    @InjectRepository(TrophyGroup)
    private readonly groupsRepo: Repository<TrophyGroup>,
    @InjectRepository(Leg)
    private readonly legsRepo: Repository<Leg>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(RaceResult)
    private readonly resultsRepo: Repository<RaceResult>,
    private readonly legsService: LegsService,
  ) {}

  private assertOwner(trophy: Trophy, user: SessionUser) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yönetici yetkisi gerekli');
    }
    if (user.role === UserRoleEnum.ADMIN && trophy.createdById !== user.sub) {
      throw new ForbiddenException('Bu trofe size ait değil.');
    }
  }

  private async serializeLegs(legs: Leg[]) {
    const sorted = [...legs].sort((a, b) => {
      const ao = a.legOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.legOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return new Date(a.startDate ?? 0).getTime() - new Date(b.startDate ?? 0).getTime();
    });
    return Promise.all(
      sorted.map(async (leg) => {
        const races = await this.racesRepo.find({
          where: { legId: leg.id },
          relations: ['course'],
          order: { raceOrder: 'ASC', startDate: 'ASC' },
        });
        const applicationCount = await this.applicationsRepo.count({
          where: { legId: leg.id },
        });
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
      }),
    );
  }

  private async withLegs(trophy: Trophy) {
    const legs = await this.legsRepo.find({
      where: { trophyId: trophy.id },
      relations: ['trophy'],
      order: { legOrder: 'ASC', startDate: 'ASC' },
    });
    return serializeTrophy(trophy, await this.serializeLegs(legs));
  }

  async findAllManage(user: SessionUser) {
    if (user.role === UserRoleEnum.COMMITTEE) {
      const assignedLegs = await this.legsRepo.find({
        where: {
          kind: LegKindEnum.TROFE_LEG,
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
      return Promise.all(trophies.map((t) => this.withLegs(t)));
    }

    if (user.role === UserRoleEnum.ADMIN) {
      const trophies = await this.trophiesRepo.find({
        where: { createdById: user.sub },
        order: { createdAt: 'DESC' },
      });
      return Promise.all(trophies.map((t) => this.withLegs(t)));
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
      const assignedCount = await this.legsRepo.count({
        where: {
          trophyId: id,
          assignedCommitteeId: user.sub,
          kind: LegKindEnum.TROFE_LEG,
        },
      });
      if (assignedCount === 0) {
        throw new ForbiddenException('Bu trofede size atanmış ayak yok.');
      }
    }
    if (user?.role === UserRoleEnum.ADMIN && trophy.createdById !== user.sub) {
      throw new ForbiddenException('Bu trofe size ait değil.');
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
      maxGroupCount: dto.maxGroupCount ?? null,
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
        const currentLegs = await this.legsRepo.count({ where: { trophyId: id } });
        if (dto.plannedLegCount < currentLegs) {
          throw new BadRequestException(
            `Planlanan ayak sayısı mevcut ayak sayısından (${currentLegs}) küçük olamaz.`,
          );
        }
      }
      trophy.plannedLegCount = dto.plannedLegCount ?? null;
    }
    if (dto.maxGroupCount !== undefined) {
      if (dto.maxGroupCount != null) {
        const currentGroups = await this.groupsRepo.count({ where: { trophyId: id } });
        if (dto.maxGroupCount < currentGroups) {
          throw new BadRequestException(
            `Maksimum grup sayısı mevcut grup sayısından (${currentGroups}) küçük olamaz.`,
          );
        }
      }
      trophy.maxGroupCount = dto.maxGroupCount ?? null;
    }

    await this.trophiesRepo.save(trophy);
    return this.withLegs(trophy);
  }

  async remove(id: string, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const legCount = await this.legsRepo.count({ where: { trophyId: id } });
    if (legCount > 0) {
      throw new BadRequestException(
        'Trofe silinemez: önce tüm ayakları silin.',
      );
    }
    await this.trophiesRepo.remove(trophy);
    return { ok: true };
  }

  async addLeg(trophyId: string, dto: CreateTrophyLegDto, user: SessionUser) {
    return this.legsService.createTrophyLeg(trophyId, dto, user);
  }

  private async assertCanViewTrophy(trophy: Trophy, user: SessionUser) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) return;
    if (user.role === UserRoleEnum.ADMIN) {
      if (trophy.createdById !== user.sub) {
        throw new ForbiddenException('Bu trofe size ait değil.');
      }
      return;
    }
    if (user.role === UserRoleEnum.COMMITTEE) {
      const assignedCount = await this.legsRepo.count({
        where: {
          trophyId: trophy.id,
          assignedCommitteeId: user.sub,
          kind: LegKindEnum.TROFE_LEG,
        },
      });
      if (assignedCount === 0) {
        throw new ForbiddenException('Bu trofede size atanmış ayak yok.');
      }
      return;
    }
    throw new ForbiddenException('Bu işlem için yetkiniz yok');
  }

  private async groupMemberCount(groupId: string): Promise<number> {
    return this.applicationsRepo.count({
      where: {
        groupId,
        status: In([ApplicationStatusEnum.APPROVED, ApplicationStatusEnum.CHECKED_IN]),
      },
    });
  }

  async listGroups(trophyId: string, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    await this.assertCanViewTrophy(trophy, user);

    const groups = await this.groupsRepo.find({
      where: { trophyId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return Promise.all(
      groups.map(async (g) => serializeTrophyGroup(g, await this.groupMemberCount(g.id))),
    );
  }

  async createGroup(trophyId: string, dto: CreateTrophyGroupDto, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const existingCount = await this.groupsRepo.count({ where: { trophyId } });
    if (trophy.maxGroupCount != null && existingCount >= trophy.maxGroupCount) {
      throw new BadRequestException(
        `Bu trofe için en fazla ${trophy.maxGroupCount} grup oluşturulabilir.`,
      );
    }

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Grup adı gerekli');

    const duplicate = await this.groupsRepo.findOne({
      where: { trophyId, name },
    });
    if (duplicate) {
      throw new BadRequestException('Bu isimde bir grup zaten var.');
    }

    const maxSort = await this.groupsRepo
      .createQueryBuilder('g')
      .select('MAX(g.sortOrder)', 'max')
      .where('g.trophyId = :trophyId', { trophyId })
      .getRawOne<{ max: string | null }>();
    const nextSort =
      dto.sortOrder ??
      (maxSort?.max != null ? Number(maxSort.max) + 1 : 0);

    const group = this.groupsRepo.create({
      trophyId,
      name,
      capacity: dto.capacity ?? null,
      sortOrder: Number.isFinite(nextSort) ? nextSort : existingCount,
    });
    const saved = await this.groupsRepo.save(group);
    return serializeTrophyGroup(saved, 0);
  }

  async updateGroup(
    trophyId: string,
    groupId: string,
    dto: UpdateTrophyGroupDto,
    user: SessionUser,
  ) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const group = await this.groupsRepo.findOne({
      where: { id: groupId, trophyId },
    });
    if (!group) throw new NotFoundException('Grup bulunamadı');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Grup adı gerekli');
      const duplicate = await this.groupsRepo.findOne({
        where: { trophyId, name },
      });
      if (duplicate && duplicate.id !== group.id) {
        throw new BadRequestException('Bu isimde bir grup zaten var.');
      }
      group.name = name;
    }
    if (dto.capacity !== undefined) {
      group.capacity = dto.capacity ?? null;
    }
    if (dto.sortOrder !== undefined) {
      group.sortOrder = dto.sortOrder;
    }

    const saved = await this.groupsRepo.save(group);
    return serializeTrophyGroup(saved, await this.groupMemberCount(saved.id));
  }

  async removeGroup(trophyId: string, groupId: string, user: SessionUser) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');
    this.assertOwner(trophy, user);

    const group = await this.groupsRepo.findOne({
      where: { id: groupId, trophyId },
    });
    if (!group) throw new NotFoundException('Grup bulunamadı');

    const memberCount = await this.groupMemberCount(groupId);
    if (memberCount > 0) {
      throw new BadRequestException(
        'Gruba atanmış onaylı başvuru varken silinemez. Önce başvuruları başka gruba taşıyın veya geri çekin.',
      );
    }

    await this.groupsRepo.remove(group);
    return { ok: true };
  }

  async getStandings(trophyId: string) {
    const trophy = await this.trophiesRepo.findOne({ where: { id: trophyId } });
    if (!trophy) throw new NotFoundException('Trofe bulunamadı');

    const legs = await this.legsRepo.find({
      where: { trophyId },
      order: { legOrder: 'ASC', startDate: 'ASC' },
    });

    if (legs.length === 0) {
      return {
        trophy: { id: trophy.id, title: trophy.title },
        legs: [],
        races: [],
        standings: [],
      };
    }

    const legIds = legs.map((l) => l.id);
    const races = await this.racesRepo.find({
      where: { legId: In(legIds) },
      order: { raceOrder: 'ASC', startDate: 'ASC' },
    });

    const applications = await this.applicationsRepo.find({
      where: { legId: In(legIds) },
    });

    const raceIds = races.map((r) => r.id);
    const results =
      raceIds.length === 0
        ? []
        : await this.resultsRepo.find({ where: { raceId: In(raceIds) } });

    const resultByAppRace = new Map<string, RaceResult>();
    for (const result of results) {
      resultByAppRace.set(`${result.applicationId}:${result.raceId}`, result);
    }

    const appsByLeg = new Map<string, RaceApplication[]>();
    for (const app of applications) {
      if (!app.legId) continue;
      const list = appsByLeg.get(app.legId) ?? [];
      list.push(app);
      appsByLeg.set(app.legId, list);
    }

    type Competitor = {
      key: string;
      sailNumber: string;
      boatName: string;
      name: string;
      email: string;
      club: string | null;
      racePoints: Record<string, number | null>;
      raceResults: Record<
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
          racePoints: {},
          raceResults: {},
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

    for (const race of races) {
      const legApps = appsByLeg.get(race.legId ?? '') ?? [];
      const fleetSize = Math.max(
        legApps.filter(
          (a) =>
            ![ApplicationStatusEnum.WITHDRAWN, ApplicationStatusEnum.PENDING].includes(
              a.status as ApplicationStatusEnum,
            ),
        ).length,
        1,
      );
      const dnsPoints = fleetSize + 1;
      const isFinished = race.status === RaceStatusEnum.FINISHED;

      for (const app of legApps) {
        if (app.status === ApplicationStatusEnum.WITHDRAWN) continue;
        if (app.status === ApplicationStatusEnum.PENDING) continue;
        const c = ensureCompetitor(app);
        const result = resultByAppRace.get(`${app.id}:${race.id}`);
        let points: number;
        let scored = false;

        if (result?.finishPosition != null) {
          points = result.finishPosition;
          scored = true;
        } else if (
          result?.status === RaceResultStatusEnum.DNS ||
          result?.status === RaceResultStatusEnum.DNF ||
          result?.status === RaceResultStatusEnum.DSQ ||
          isFinished
        ) {
          points = result?.fleetSize != null ? result.fleetSize + 1 : dnsPoints;
          scored = true;
        } else {
          points = 0;
          scored = false;
        }

        c.racePoints[race.id] = scored ? points : null;
        c.raceResults[race.id] = {
          points: scored ? points : 0,
          finishPosition: result?.finishPosition ?? null,
          status: String(result?.status ?? app.status),
          scored,
        };
      }

      if (isFinished) {
        for (const c of competitors.values()) {
          if (c.raceResults[race.id]) continue;
          c.racePoints[race.id] = dnsPoints;
          c.raceResults[race.id] = {
            points: dnsPoints,
            finishPosition: null,
            status: RaceResultStatusEnum.DNS,
            scored: true,
          };
        }
      }
    }

    const standings = Array.from(competitors.values()).map((c) => {
      let total = 0;
      let racesScored = 0;
      for (const race of races) {
        const result = c.raceResults[race.id];
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
        racePoints: Object.fromEntries(races.map((race) => [race.id, c.racePoints[race.id] ?? null])),
        raceResults: c.raceResults,
        // Backward-compatible aliases for UI still keyed by "leg"
        legPoints: Object.fromEntries(races.map((race) => [race.id, c.racePoints[race.id] ?? null])),
        legResults: c.raceResults,
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
          'Her yarışta bitiş pozisyonu puan olarak sayılır. DNS/DNF/DSQ ve katılmayanlar için filo sayısı + 1. En düşük toplam üsttedir.',
      },
      legs: legs.map((leg) => ({
        id: leg.id,
        title: leg.title,
        legOrder: leg.legOrder,
        status: String(leg.status).toLowerCase(),
        startDate: leg.startDate ? leg.startDate.toISOString() : null,
      })),
      races: races.map((race) => ({
        id: race.id,
        legId: race.legId,
        title: race.title,
        raceOrder: race.raceOrder,
        status: String(race.status).toLowerCase(),
        startDate: race.startDate ? race.startDate.toISOString() : null,
      })),
      standings: standings.map((row, index) => ({
        rank: index + 1,
        ...row,
      })),
    };
  }
}
