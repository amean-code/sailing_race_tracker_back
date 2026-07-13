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
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { RaceStatusEnum, NotificationEventEnum } from '../common/constants';
import { serializeRace, RaceLike } from '../common/utils/serialize-race';
import {
  CreateRaceDto,
  RaceApplicationDto,
  UpdateRaceDto,
} from './dto/race.dto';
import { RecordCheckpointPassDto } from './dto/checkpoint-pass.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RacesService {
  constructor(
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(CheckpointPass)
    private readonly checkpointPassRepo: Repository<CheckpointPass>,
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
    if (dto.status !== undefined) {
      this.applyStatusChange(race, dto.status);
      if (dto.status === RaceStatusEnum.CLOSED) {
        await this.finalizeRaceResults(race.id);
      }
    }
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

  async recordCheckpointPass(raceId: string, dto: RecordCheckpointPassDto) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const app = await this.applicationsRepo.findOne({
      where: { id: dto.applicationId, raceId },
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');

    // Idempotency: if this application already has a pass for this checkpoint, update it
    const existing = await this.checkpointPassRepo.findOne({
      where: { applicationId: dto.applicationId, raceId, checkpointIndex: dto.checkpointIndex },
    });

    // Count how many other applications already passed this checkpoint (for rank)
    const passedCount = await this.checkpointPassRepo.count({
      where: { raceId, checkpointIndex: dto.checkpointIndex },
    });
    const rank = existing ? (existing.rank ?? passedCount) : passedCount + 1;

    if (existing) {
      existing.passedAt = new Date(dto.passedAt);
      existing.elapsedSeconds = dto.elapsedSeconds ?? null;
      existing.rank = rank;
      await this.checkpointPassRepo.save(existing);
      return { ok: true, id: existing.id, rank };
    }

    const pass = this.checkpointPassRepo.create({
      raceId,
      applicationId: dto.applicationId,
      checkpointIndex: dto.checkpointIndex,
      checkpointId: dto.checkpointId,
      passedAt: new Date(dto.passedAt),
      elapsedSeconds: dto.elapsedSeconds ?? null,
      rank,
    });
    const saved = await this.checkpointPassRepo.save(pass);
    return { ok: true, id: saved.id, rank };
  }

  async getStandings(raceId: string) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const applications = await this.applicationsRepo.find({
      where: { raceId },
      relations: ['boat'],
      order: { createdAt: 'ASC' },
    });

    // Get latest checkpoint pass per application
    const passes = await this.checkpointPassRepo.find({
      where: { raceId },
      order: { checkpointIndex: 'DESC', passedAt: 'ASC' },
    });

    // Build a map: applicationId -> best pass (latest checkpoint)
    const bestPassByApp = new Map<string, CheckpointPass>();
    for (const p of passes) {
      const existing = bestPassByApp.get(p.applicationId);
      if (!existing || p.checkpointIndex > existing.checkpointIndex) {
        bestPassByApp.set(p.applicationId, p);
      }
    }

    // Get all passes for computing segment times
    const allPassesByApp = new Map<string, CheckpointPass[]>();
    for (const p of passes) {
      if (!allPassesByApp.has(p.applicationId)) allPassesByApp.set(p.applicationId, []);
      allPassesByApp.get(p.applicationId)!.push(p);
    }

    const raceStartedAt = race.raceState?.startedAt as string | undefined;

    const standings = applications.map((app) => {
      const best = bestPassByApp.get(app.id) ?? null;
      const appPasses = (allPassesByApp.get(app.id) ?? [])
        .sort((a, b) => a.checkpointIndex - b.checkpointIndex);

      const elapsedNow = raceStartedAt
        ? Math.floor((Date.now() - new Date(raceStartedAt).getTime()) / 1000)
        : null;

      return {
        applicationId: app.id,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        competitorName: app.name,
        displayColor: app.boat?.displayColor ?? null,
        checkpointIndex: best?.checkpointIndex ?? -1,
        checkpointId: best?.checkpointId ?? null,
        elapsedSeconds: best?.elapsedSeconds ?? null,
        rank: best?.rank ?? null,
        elapsedNow,
        passes: appPasses.map((p) => ({
          checkpointIndex: p.checkpointIndex,
          checkpointId: p.checkpointId,
          passedAt: p.passedAt.toISOString(),
          elapsedSeconds: p.elapsedSeconds,
          rank: p.rank,
        })),
        status: app.status,
        finishPosition: app.finishPosition,
      };
    });

    // Sort by checkpointIndex DESC, then elapsedSeconds ASC
    standings.sort((a, b) => {
      if (b.checkpointIndex !== a.checkpointIndex) return b.checkpointIndex - a.checkpointIndex;
      if (a.elapsedSeconds != null && b.elapsedSeconds != null) return a.elapsedSeconds - b.elapsedSeconds;
      return 0;
    });

    return { standings, raceStartedAt: raceStartedAt ?? null };
  }

  private async finalizeRaceResults(raceId: string): Promise<void> {
    const race = await this.racesRepo.findOne({
      where: { id: raceId },
      relations: ['course'],
    });
    if (!race || !race.course) return;

    const checkpoints = race.course.checkpoints as any[] | null;
    if (!checkpoints || checkpoints.length === 0) return;

    const finishIndex = checkpoints.length - 1;

    // Fetch all applications for this race
    const apps = await this.applicationsRepo.find({
      where: { raceId },
    });

    if (apps.length === 0) return;

    // Fetch all checkpoint passes for this race
    const allPasses = await this.checkpointPassRepo.find({
      where: { raceId },
    });

    // Group passes by application ID
    const passesByApp: Record<string, CheckpointPass[]> = {};
    for (const pass of allPasses) {
      if (!passesByApp[pass.applicationId]) {
        passesByApp[pass.applicationId] = [];
      }
      passesByApp[pass.applicationId].push(pass);
    }

    // Rank applicants
    const rankedApps = apps.map((app) => {
      const appPasses = passesByApp[app.id] || [];
      
      // Check if crossed finish line
      const finishPass = appPasses.find((p) => p.checkpointIndex === finishIndex);
      
      // Get maximum checkpoint index passed
      let maxCpIndex = -1;
      let maxCpElapsed = 0;
      for (const p of appPasses) {
        if (p.checkpointIndex > maxCpIndex) {
          maxCpIndex = p.checkpointIndex;
          maxCpElapsed = p.elapsedSeconds ?? 0;
        }
      }

      return {
        app,
        finished: !!finishPass,
        finishElapsed: finishPass ? (finishPass.elapsedSeconds ?? Infinity) : Infinity,
        maxCpIndex,
        maxCpElapsed,
      };
    });

    // Sort: 
    // 1. Finished boats sorted by finish time (ascending)
    // 2. Unfinished boats sorted by furthest checkpoint (descending) and time at that checkpoint (ascending)
    // 3. Didn't start sorted by application id
    rankedApps.sort((a, b) => {
      if (a.finished && b.finished) {
        return a.finishElapsed - b.finishElapsed;
      }
      if (a.finished) return -1;
      if (b.finished) return 1;

      if (a.maxCpIndex !== b.maxCpIndex) {
        return b.maxCpIndex - a.maxCpIndex; // Furthest checkpoint first
      }

      if (a.maxCpIndex !== -1) {
        return a.maxCpElapsed - b.maxCpElapsed; // Quickest time at that checkpoint first
      }

      return a.app.id.localeCompare(b.app.id);
    });

    // Save final rankings in DB
    const fleetSize = apps.length;
    for (let i = 0; i < rankedApps.length; i++) {
      const item = rankedApps[i];
      item.app.finishPosition = i + 1;
      item.app.fleetSize = fleetSize;
      await this.applicationsRepo.save(item.app);
    }
  }
}
