import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Leg } from '../entities/leg.entity';
import { Course } from '../entities/course.entity';
import { User } from '../entities/user.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RaceResult } from '../entities/race-result.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { TrackPoint } from '../entities/track-point.entity';
import {
  RaceStatusEnum,
  NotificationEventEnum,
  CourseStatusEnum,
  UserRoleEnum,
  ApplicationStatusEnum,
  RaceResultStatusEnum,
} from '../common/constants';
import { SessionUser } from '../common/decorators';
import { serializeRace, RaceLike } from '../common/utils/serialize-race';
import {
  CreateRaceDto,
  RaceApplicationDto,
  UpdateRaceDto,
  RaceActionDto,
} from './dto/race.dto';
import { RecordCheckpointPassDto } from './dto/checkpoint-pass.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../notifications/mail.service';

import { EventEmitter2 } from '@nestjs/event-emitter';
import ExcelJS from 'exceljs';

export type RaceResultsExportFormat = 'csv' | 'xlsx';

export interface RaceResultsExportFile {
  format: RaceResultsExportFormat;
  filename: string;
  contentType: string;
  body: Buffer;
}

@Injectable()
export class RacesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RacesService.name);
  private scheduledStartTimer: ReturnType<typeof setInterval> | null = null;
  private processingScheduledStarts = false;

  constructor(
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(Leg)
    private readonly legsRepo: Repository<Leg>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(RaceResult)
    private readonly resultsRepo: Repository<RaceResult>,
    @InjectRepository(CheckpointPass)
    private readonly checkpointPassRepo: Repository<CheckpointPass>,
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    @InjectRepository(TrackPoint)
    private readonly trackPointsRepo: Repository<TrackPoint>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private eventEmitter: EventEmitter2,
  ) { }

  onModuleInit() {
    // Server-side auto-start so scheduled races fire even if the committee browser is closed/refreshed
    this.scheduledStartTimer = setInterval(() => {
      void this.processDueScheduledStarts();
    }, 2000);
  }

  onModuleDestroy() {
    if (this.scheduledStartTimer) {
      clearInterval(this.scheduledStartTimer);
      this.scheduledStartTimer = null;
    }
  }

  private mergeRaceState(
    current: Record<string, unknown> | null | undefined,
    patch: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(current ?? {}) };
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  private emitRaceUpdated(race: Race, applicationCount?: number) {
    const serialized = serializeRace({
      ...race,
      applicationCount: applicationCount ?? 0,
    } as RaceLike);
    this.eventEmitter.emit('race.updated', {
      raceId: race.id,
      status: race.status,
      raceState: race.raceState ?? {},
      courseSnapshot: race.courseSnapshot ?? null,
      race: serialized,
    });
  }

  /** Start OPEN races whose scheduledStartAt has passed (persisted countdown). */
  async processDueScheduledStarts() {
    if (this.processingScheduledStarts) return;
    this.processingScheduledStarts = true;
    try {
      const openRaces = await this.racesRepo.find({
        where: { status: RaceStatusEnum.OPEN },
        relations: ['course'],
      });
      const now = Date.now();
      for (const race of openRaces) {
        const scheduledIso = race.raceState?.scheduledStartAt;
        if (typeof scheduledIso !== 'string') continue;
        const fireAt = new Date(scheduledIso).getTime();
        if (!Number.isFinite(fireAt) || fireAt > now) continue;
        try {
          await this.startRaceAtScheduledTime(race);
        } catch (err: any) {
          this.logger.error(`Scheduled start failed for race ${race.id}: ${err?.message || err}`);
        }
      }
    } finally {
      this.processingScheduledStarts = false;
    }
  }

  private async startRaceAtScheduledTime(race: Race) {
    // Re-read to avoid racing with a concurrent committee start
    const fresh = await this.racesRepo.findOne({
      where: { id: race.id },
      relations: ['course'],
    });
    if (!fresh || fresh.status !== RaceStatusEnum.OPEN) return;
    if (typeof fresh.raceState?.scheduledStartAt !== 'string') return;

    const startedAt = new Date().toISOString();
    fresh.status = RaceStatusEnum.IN_PROGRESS;

    if (!fresh.courseSnapshot && fresh.courseId) {
      const courseForSnapshot =
        fresh.course ||
        (await this.coursesRepo.findOne({ where: { id: fresh.courseId } }));
      if (courseForSnapshot) {
        fresh.courseSnapshot = JSON.parse(JSON.stringify(courseForSnapshot));
      }
    }

    const state = { ...(fresh.raceState || {}) };
    state.startedAt = startedAt;
    delete state.scheduledStartAt;
    fresh.raceState = state;

    const saved = await this.racesRepo.save(fresh);
    this.logger.log(`Race ${saved.id} auto-started from scheduledStartAt`);
    this.eventEmitter.emit('race.started', { raceId: saved.id });
    this.emitRaceUpdated(saved);
  }

  private async withCount(race: Race) {
    return serializeRace({
      ...race,
      leg: race.leg
        ? {
            id: race.leg.id,
            title: race.leg.title,
            kind: race.leg.kind,
            trophyId: race.leg.trophyId,
            location: race.leg.location,
            venue: race.leg.venue,
            organizer: race.leg.organizer,
            boatClass: race.leg.boatClass,
            capacity: race.leg.capacity,
            assignedCommitteeId: race.leg.assignedCommitteeId,
          }
        : null,
    } as RaceLike);
  }

  private async loadRace(id: string) {
    const race = await this.racesRepo.findOne({
      where: { id },
      relations: ['course', 'leg'],
    });
    if (!race) throw new NotFoundException('Yarış bulunamadı');
    return race;
  }

  private assertCommitteeAssigned(race: Race, user: SessionUser) {
    if (user.role !== UserRoleEnum.COMMITTEE) return;
    const assignedId = race.leg?.assignedCommitteeId;
    if (assignedId !== user.sub) {
      throw new ForbiddenException('Bu yarış size atanmamış.');
    }
  }

  private assertAdminOwnsRace(race: Race, user: SessionUser) {
    if (user.role !== UserRoleEnum.ADMIN) return;
    const ownerId = race.leg?.createdById ?? race.createdById;
    if (ownerId !== user.sub) {
      throw new ForbiddenException('Bu yarış size ait değil.');
    }
  }

  private assertCanManageRace(race: Race, user: SessionUser) {
    this.assertCommitteeAssigned(race, user);
    this.assertAdminOwnsRace(race, user);
  }

  private static readonly COMMITTEE_RACE_METADATA_FIELDS = [
    'title',
    'description',
    'startDate',
    'endDate',
  ] as const;

  private assertCommitteeNotEditingMetadata(dto: UpdateRaceDto, user: SessionUser) {
    if (user.role !== UserRoleEnum.COMMITTEE) return;
    const hasMetadataChange = RacesService.COMMITTEE_RACE_METADATA_FIELDS.some(
      (key) => dto[key] !== undefined,
    );
    if (hasMetadataChange) {
      throw new ForbiddenException('Hakem yarış bilgilerini düzenleyemez.');
    }
  }

  private async resolveCommitteeId(committeeId: string): Promise<string> {
    const referee = await this.usersRepo.findOne({ where: { id: committeeId } });
    if (!referee || referee.role !== UserRoleEnum.COMMITTEE) {
      throw new BadRequestException('Geçerli bir hakem seçilmelidir.');
    }
    return referee.id;
  }

  private async getLegApplications(legId: string) {
    return this.applicationsRepo.find({
      where: {
        legId,
        status: In([
          ApplicationStatusEnum.APPROVED,
          ApplicationStatusEnum.CHECKED_IN,
          ApplicationStatusEnum.DNS,
          ApplicationStatusEnum.DNF,
          ApplicationStatusEnum.DSQ,
        ]),
      },
      relations: ['boat'],
      order: { createdAt: 'ASC' },
    });
  }

  async findAllManage(user?: SessionUser, status?: string) {
    const qb = this.racesRepo
      .createQueryBuilder('race')
      .leftJoinAndSelect('race.course', 'course')
      .leftJoinAndSelect('race.leg', 'leg')
      .orderBy('race.startDate', 'ASC');

    if (user?.role === UserRoleEnum.COMMITTEE) {
      qb.andWhere('leg.assignedCommitteeId = :userId', { userId: user.sub });
    } else if (user?.role === UserRoleEnum.ADMIN) {
      qb.andWhere('leg.createdById = :userId', { userId: user.sub });
    }

    if (status) {
      const statuses = status.split(',');
      qb.andWhere('race.status IN (:...statuses)', { statuses });
    }

    const races = await qb.getMany();
    return Promise.all(races.map((r) => this.withCount(r)));
  }

  async findPublic() {
    const races = await this.racesRepo.find({
      where: [
        { status: RaceStatusEnum.OPEN },
        { status: RaceStatusEnum.IN_PROGRESS },
        { status: RaceStatusEnum.FINISHED },
      ],
      relations: ['course', 'leg'],
      order: { startDate: 'ASC' },
    });
    return Promise.all(races.map((r) => this.withCount(r)));
  }

  async findOne(id: string, user?: SessionUser) {
    const race = await this.loadRace(id);
    if (user) this.assertCanManageRace(race, user);
    return this.withCount(race);
  }

  async create(_dto: CreateRaceDto, _createdById: string) {
    throw new BadRequestException(
      'Yarış oluşturmak için POST /legs (regata/tek) veya POST /trophies/:id/legs + POST /legs/:id/races kullanın.',
    );
  }

  private applyStatusChange(race: Race, nextStatus: RaceStatusEnum): void {
    const previous = race.status;

    if (previous === RaceStatusEnum.FINISHED && nextStatus !== RaceStatusEnum.FINISHED) {
      throw new BadRequestException('Tamamlanmış bir yarış tekrar başlatılamaz veya açılamaz.');
    }

    if (nextStatus === RaceStatusEnum.FINISHED && previous !== RaceStatusEnum.FINISHED) {
      const now = new Date().toISOString();
      const startedAt = race.raceState?.startedAt;
      let durationSeconds = 0;
      if (startedAt) {
        durationSeconds = Math.floor((new Date(now).getTime() - new Date(startedAt as string).getTime()) / 1000);
      }
      race.raceState = {
        ...(race.raceState ?? {}),
        finishedAt: now,
        durationSeconds,
      };
    }

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

  async handleRaceAction(id: string, dto: RaceActionDto, user: SessionUser) {
    const race = await this.loadRace(id);

    if (!['COMMITTEE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    this.assertCanManageRace(race, user);

    const { action, reason } = dto;

    if (action === 'finish') {
      race.status = RaceStatusEnum.FINISHED;
      
      const now = new Date().toISOString();
      const state = { ...(race.raceState || {}) };
      state.finishedAt = now;
      if (state.startedAt) {
        state.durationSeconds = Math.floor((new Date(now).getTime() - new Date(state.startedAt as string).getTime()) / 1000);
      }
      race.raceState = state;
      
      await this.racesRepo.save(race);
      await this.finalizeRaceResults(race.id);
    } else if (action === 'abandon') {
      race.status = RaceStatusEnum.CANCELLED;
      if (!race.title.startsWith('TAMAMLANAMAYAN ')) {
        race.title = `TAMAMLANAMAYAN ${race.title}`;
      }
      const now = new Date().toISOString();
      const state = { ...(race.raceState || {}) };
      state.abandonReason = reason;
      state.finishedAt = now;
      if (state.startedAt) {
        state.durationSeconds = Math.floor((new Date(now).getTime() - new Date(state.startedAt as string).getTime()) / 1000);
      }
      race.raceState = state;
      await this.racesRepo.save(race);
      await this.finalizeRaceResults(race.id);
    } else if (action === 'restart') {
      race.status = RaceStatusEnum.OPEN;
      const state = { ...(race.raceState || {}) };
      delete state.startedAt;
      delete state.statusBeforeSuspend;
      delete state.statusBeforeClose;
      delete state.statusBeforeCancel;
      delete state.finishedAt;
      delete state.durationSeconds;
      delete state.scheduledStartAt;
      state.restartReason = reason;
      race.raceState = state;

      await this.racesRepo.save(race);

      await this.checkpointPassRepo.delete({ raceId: race.id });
      await this.trackPointsRepo.delete({ raceId: race.id });
      await this.resultsRepo.delete({ raceId: race.id });
    } else {
      throw new BadRequestException('Geçersiz işlem');
    }

    const saved = await this.loadRace(id);
    this.emitRaceUpdated(saved);
    if (action === 'finish') {
      this.eventEmitter.emit('race.finished', {
        raceId: saved.id,
        userId: user.sub,
      });
    } else if (action === 'abandon') {
      this.eventEmitter.emit('race.cancelled', {
        raceId: saved.id,
        userId: user.sub,
      });
    }
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateRaceDto, user?: SessionUser) {
    const race = await this.loadRace(id);

    if (!user || !['COMMITTEE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    this.assertCanManageRace(race, user);
    this.assertCommitteeNotEditingMetadata(dto, user);

    const previousStatus = race.status;

    if (dto.title !== undefined) race.title = dto.title;
    if (dto.description !== undefined) race.description = dto.description ?? null;
    if (dto.startDate !== undefined) race.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) race.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.status !== undefined) {
      this.applyStatusChange(race, dto.status);
      if (dto.status === RaceStatusEnum.FINISHED) {
        await this.finalizeRaceResults(race.id);
      }
      if (dto.status === RaceStatusEnum.CANCELLED && previousStatus !== RaceStatusEnum.CANCELLED) {
        if (!race.title.startsWith('TAMAMLANAMAYAN ')) {
          race.title = `TAMAMLANAMAYAN ${race.title}`;
        }
      } else if (dto.status !== RaceStatusEnum.CANCELLED && previousStatus === RaceStatusEnum.CANCELLED) {
        if (race.title.startsWith('TAMAMLANAMAYAN ')) {
          race.title = race.title.replace('TAMAMLANAMAYAN ', '');
        }
      }
    }
    if (dto.courseId !== undefined) {
      if (dto.courseId) {
        const course = await this.coursesRepo.findOne({ where: { id: dto.courseId } });
        if (!course) throw new NotFoundException('Seçilen parkur bulunamadı.');
      }
      race.courseId = dto.courseId ?? null;
    }
    if (dto.courseIds !== undefined) {
      race.courseIds = dto.courseIds ?? [];
    }
    if (dto.raceState !== undefined) {
      race.raceState = this.mergeRaceState(race.raceState, dto.raceState);
    }
    
    let courseSnapshotChanged = false;
    if (dto.courseSnapshot !== undefined) {
      race.courseSnapshot = dto.courseSnapshot;
      courseSnapshotChanged = true;
    }

    if (race.status === RaceStatusEnum.IN_PROGRESS && !race.courseSnapshot && race.courseId) {
      const courseForSnapshot = await this.coursesRepo.findOne({ where: { id: race.courseId } });
      if (courseForSnapshot) {
        race.courseSnapshot = JSON.parse(JSON.stringify(courseForSnapshot));
      }
    }

    if (
      dto.status === RaceStatusEnum.IN_PROGRESS &&
      previousStatus !== RaceStatusEnum.IN_PROGRESS
    ) {
      const state = { ...(race.raceState || {}) };
      delete state.scheduledStartAt;
      if (!state.startedAt) {
        state.startedAt = new Date().toISOString();
      }
      race.raceState = state;
    }

    const saved = await this.racesRepo.save(race);
    const result = await this.findOne(saved.id);

    const ctx = {
      raceTitle: saved.title,
      raceLocation: saved.leg?.location ?? '',
      raceStatus: saved.status,
    };

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_STATUS_CHANGED, ctx);
      
      const statusEventMap: Record<string, string> = {
        [RaceStatusEnum.OPEN]: 'race.opened',
        [RaceStatusEnum.IN_PROGRESS]: 'race.started',
        [RaceStatusEnum.FINISHED]: 'race.finished',
        [RaceStatusEnum.CANCELLED]: 'race.cancelled',
        [RaceStatusEnum.SUSPENDED]: 'race.suspended',
      };
      const eventName = statusEventMap[dto.status];
      if (eventName) {
        this.eventEmitter.emit(eventName, {
          raceId: saved.id,
          userId: user?.sub,
        });
      }
    } else {
      this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_UPDATED, ctx);
    }
    
    if (courseSnapshotChanged) {
      this.eventEmitter.emit('course.updated', {
        raceId: saved.id,
        courseSnapshot: saved.courseSnapshot,
      });
    }

    this.emitRaceUpdated(saved);
    return result;
  }

  async remove(id: string, user?: SessionUser) {
    const race = await this.loadRace(id);

    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Yarış silme yetkisi yalnızca yöneticilerdedir.');
    }
    this.assertAdminOwnsRace(race, user);

    const ctx = {
      raceTitle: race.title,
      raceLocation: race.leg?.location ?? '',
    };

    const result = await this.racesRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Yarış silinemedi');

    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_DELETED, ctx);
    return { ok: true };
  }

  async cloneRace(id: string, createdById: string, user?: SessionUser) {
    const race = await this.loadRace(id);
    if (user) this.assertAdminOwnsRace(race, user);
    if (!race.legId) {
      throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');
    }

    const existing = await this.racesRepo.find({
      where: { legId: race.legId },
      select: ['raceOrder'],
    });
    const maxOrder = existing.reduce((max, r) => Math.max(max, r.raceOrder ?? 0), 0);

    const clone = this.racesRepo.create({
      title: `[KOPYA] ${race.title}`,
      description: race.description,
      startDate: race.startDate,
      endDate: race.endDate,
      status: RaceStatusEnum.DRAFT,
      courseId: race.courseId,
      courseIds: race.courseIds ?? [],
      raceState: {},
      createdById,
      legId: race.legId,
      raceOrder: maxOrder + 1,
    });
    const saved = await this.racesRepo.save(clone);
    return this.findOne(saved.id);
  }

  async submitApplication(raceId: string, dto: RaceApplicationDto, user?: SessionUser) {
    const race = await this.loadRace(raceId);
    if (!race.legId) {
      throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');
    }
    throw new BadRequestException(
      `Başvurular ayak üzerinden alınır. POST /legs/${race.legId}/applications kullanın.`,
    );
  }

  async recordCheckpointPass(raceId: string, dto: RecordCheckpointPassDto, user?: SessionUser) {
    const race = await this.loadRace(raceId);

    if (!race.legId) throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');

    const app = await this.applicationsRepo.findOne({
      where: { id: dto.applicationId, legId: race.legId },
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
      if (dto.crossLat != null) existing.crossLat = dto.crossLat;
      if (dto.crossLng != null) existing.crossLng = dto.crossLng;
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
      crossLat: dto.crossLat ?? null,
      crossLng: dto.crossLng ?? null,
    });
    const saved = await this.checkpointPassRepo.save(pass);
    return { ok: true, id: saved.id, rank };
  }

  private getRaceTargets(race: Race): any[] {
    const checkpoints =
      (race.courseSnapshot?.checkpoints as any[]) ??
      (race.course?.checkpoints as any[]) ??
      [];
    return checkpoints.filter((cp) => {
      const k = cp.kind || cp.type;
      return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
    });
  }

  /**
   * Dynamic race result status from checkpoint progress.
   * DNS = never crossed start; DNF = started but race ended before finish;
   * DSQ = manual disqualification (preserved when already stored).
   * Persisted only on finalize so live GPS tracking keeps working.
   */
  private deriveResultStatus(opts: {
    storedStatus: string;
    maxCpIndex: number;
    finishIndex: number;
    raceOver: boolean;
  }): string {
    const { storedStatus, maxCpIndex, finishIndex, raceOver } = opts;
    if (storedStatus === ApplicationStatusEnum.WITHDRAWN) {
      return ApplicationStatusEnum.WITHDRAWN;
    }
    if (storedStatus === ApplicationStatusEnum.PENDING) {
      return ApplicationStatusEnum.PENDING;
    }
    // Manual / already-finalized penalties win over derived progress
    if (storedStatus === ApplicationStatusEnum.DSQ) {
      return ApplicationStatusEnum.DSQ;
    }
    if (
      raceOver &&
      (storedStatus === ApplicationStatusEnum.DNS || storedStatus === ApplicationStatusEnum.DNF)
    ) {
      return storedStatus;
    }

    const finished = finishIndex >= 0 && maxCpIndex === finishIndex;
    const started = maxCpIndex >= 0;

    if (finished) return 'FINISHED';
    if (!started) {
      return raceOver ? ApplicationStatusEnum.DNS : 'NOT_STARTED';
    }
    // Started but incomplete when race ends → DNF (yarıda kalan)
    return raceOver ? ApplicationStatusEnum.DNF : 'RACING';
  }

  async getStandings(raceId: string, user?: SessionUser) {
    const race = await this.loadRace(raceId);
    if (!race.legId) throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');

    const applications = await this.getLegApplications(race.legId);
    const results = await this.resultsRepo.find({ where: { raceId } });
    const resultByApp = new Map(results.map((r) => [r.applicationId, r]));

    const passes = await this.checkpointPassRepo.find({
      where: { raceId },
      order: { checkpointIndex: 'DESC', passedAt: 'ASC' },
    });

    const bestPassByApp = new Map<string, CheckpointPass>();
    for (const p of passes) {
      const existing = bestPassByApp.get(p.applicationId);
      if (!existing || p.checkpointIndex > existing.checkpointIndex) {
        bestPassByApp.set(p.applicationId, p);
      }
    }

    const allPassesByApp = new Map<string, CheckpointPass[]>();
    for (const p of passes) {
      if (!allPassesByApp.has(p.applicationId)) allPassesByApp.set(p.applicationId, []);
      allPassesByApp.get(p.applicationId)!.push(p);
    }

    const raceStartedAt = race.raceState?.startedAt as string | undefined;
    const targets = this.getRaceTargets(race);
    const finishIndex = targets.length > 0 ? targets.length - 1 : -1;
    const raceOver =
      race.status === RaceStatusEnum.FINISHED || race.status === RaceStatusEnum.CANCELLED;

    const standings = applications.map((app) => {
      const best = bestPassByApp.get(app.id) ?? null;
      const appPasses = (allPassesByApp.get(app.id) ?? [])
        .sort((a, b) => a.checkpointIndex - b.checkpointIndex);
      const raceResult = resultByApp.get(app.id);

      const elapsedNow = raceStartedAt
        ? Math.floor((Date.now() - new Date(raceStartedAt).getTime()) / 1000)
        : null;

      const maxCpIndex = best?.checkpointIndex ?? -1;
      const isFinished = finishIndex >= 0 && maxCpIndex === finishIndex;
      const storedStatus = String(raceResult?.status ?? app.status);
      const resultStatus = this.deriveResultStatus({
        storedStatus:
          storedStatus === RaceResultStatusEnum.FINISHED
            ? ApplicationStatusEnum.APPROVED
            : storedStatus,
        maxCpIndex,
        finishIndex,
        raceOver,
      });

      return {
        applicationId: app.id,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        competitorName: app.name,
        displayColor: app.boat?.displayColor ?? null,
        checkpointIndex: maxCpIndex,
        checkpointId: best?.checkpointId ?? null,
        elapsedSeconds: best?.elapsedSeconds ?? null,
        rank: best?.rank ?? null,
        elapsedNow,
        passes: appPasses.map((p) => {
          const target = targets[p.checkpointIndex];
          const checkpointKind = target?.kind || target?.type || null;
          return {
            checkpointIndex: p.checkpointIndex,
            checkpointId: p.checkpointId,
            checkpointKind,
            passedAt: p.passedAt.toISOString(),
            elapsedSeconds: p.elapsedSeconds,
            rank: p.rank,
            crossLat: p.crossLat ?? null,
            crossLng: p.crossLng ?? null,
          };
        }),
        status: resultStatus,
        storedStatus: raceResult?.status ?? app.status,
        finishPosition: raceResult?.finishPosition ?? null,
        finished: isFinished,
      };
    });

    const isPenalty = (status: string) =>
      status === ApplicationStatusEnum.DNS ||
      status === ApplicationStatusEnum.DNF ||
      status === ApplicationStatusEnum.DSQ ||
      status === 'NOT_STARTED';

    standings.sort((a, b) => {
      const aPen = isPenalty(String(a.status));
      const bPen = isPenalty(String(b.status));
      if (aPen !== bPen) return aPen ? 1 : -1;
      if (a.finished && b.finished) {
        if (a.elapsedSeconds != null && b.elapsedSeconds != null) {
          return a.elapsedSeconds - b.elapsedSeconds;
        }
      }
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (b.checkpointIndex !== a.checkpointIndex) return b.checkpointIndex - a.checkpointIndex;
      if (a.elapsedSeconds != null && b.elapsedSeconds != null) return a.elapsedSeconds - b.elapsedSeconds;
      return 0;
    });

    return { standings, raceStartedAt: raceStartedAt ?? null };
  }

  private formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private async finalizeRaceResults(raceId: string): Promise<void> {
    const race = await this.loadRace(raceId);
    if (!race.legId) return;

    const targets = this.getRaceTargets(race);
    if (targets.length === 0) return;

    const finishIndex = targets.length - 1;

    const apps = await this.getLegApplications(race.legId);
    if (apps.length === 0) return;

    const allPasses = await this.checkpointPassRepo.find({
      where: { raceId },
    });

    const passesByApp: Record<string, CheckpointPass[]> = {};
    for (const pass of allPasses) {
      if (!passesByApp[pass.applicationId]) {
        passesByApp[pass.applicationId] = [];
      }
      passesByApp[pass.applicationId].push(pass);
    }

    const existingResults = await this.resultsRepo.find({ where: { raceId } });
    const resultByApp = new Map(existingResults.map((r) => [r.applicationId, r]));

    const rankedApps = apps.map((app) => {
      const appPasses = passesByApp[app.id] || [];
      const finishPass = appPasses.find((p) => p.checkpointIndex === finishIndex);

      let maxCpIndex = -1;
      let maxCpElapsed = 0;
      for (const p of appPasses) {
        if (p.checkpointIndex > maxCpIndex) {
          maxCpIndex = p.checkpointIndex;
          maxCpElapsed = p.elapsedSeconds ?? 0;
        }
      }

      const existing = resultByApp.get(app.id);
      const resultStatus = this.deriveResultStatus({
        storedStatus: String(existing?.status ?? app.status),
        maxCpIndex,
        finishIndex,
        raceOver: true,
      });

      return {
        app,
        finished: !!finishPass,
        finishElapsed: finishPass ? (finishPass.elapsedSeconds ?? Infinity) : Infinity,
        maxCpIndex,
        maxCpElapsed,
        resultStatus,
      };
    });

    rankedApps.sort((a, b) => {
      if (a.finished && b.finished) {
        return a.finishElapsed - b.finishElapsed;
      }
      if (a.finished) return -1;
      if (b.finished) return 1;

      if (a.maxCpIndex !== b.maxCpIndex) {
        return b.maxCpIndex - a.maxCpIndex;
      }

      if (a.maxCpIndex !== -1) {
        return a.maxCpElapsed - b.maxCpElapsed;
      }

      return a.app.id.localeCompare(b.app.id);
    });

    const fleetSize = apps.length;
    let finishPlace = 0;
    for (const item of rankedApps) {
      let result = resultByApp.get(item.app.id);
      if (!result) {
        result = this.resultsRepo.create({
          applicationId: item.app.id,
          raceId,
        });
      }
      result.fleetSize = fleetSize;

      if (item.resultStatus === 'FINISHED') {
        finishPlace += 1;
        result.status = RaceResultStatusEnum.FINISHED;
        result.finishPosition = finishPlace;
      } else if (item.resultStatus === ApplicationStatusEnum.DNS) {
        result.status = RaceResultStatusEnum.DNS;
        result.finishPosition = null;
      } else if (item.resultStatus === ApplicationStatusEnum.DSQ) {
        result.status = RaceResultStatusEnum.DSQ;
        result.finishPosition = null;
      } else if (item.resultStatus === ApplicationStatusEnum.DNF) {
        result.status = RaceResultStatusEnum.DNF;
        result.finishPosition = null;
      } else {
        result.status = RaceResultStatusEnum.PENDING;
        result.finishPosition = null;
      }

      await this.resultsRepo.save(result);
    }

    const ownerId = race.leg?.createdById ?? race.createdById;
    if (ownerId) {
      const referee = await this.usersRepo.findOne({ where: { id: ownerId } });
      if (referee && referee.email) {
        this.sendResultsEmail(race, referee, rankedApps).catch((e) =>
          console.error('Sonuç maili gönderilemedi:', e),
        );
      }
    }
  }

  private async sendResultsEmail(race: Race, referee: User, rankedApps: any[]) {
    let html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 35px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">⛵ ${race.title}</h1>
        <p style="color: #bfdbfe; margin: 10px 0 0 0; font-size: 16px; font-weight: 500;">Yarış Sonuçları</p>
      </div>
      
      <!-- Body -->
      <div style="padding: 35px 30px;">
        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-top: 0;">Sayın <strong>${referee.name || 'Hakem'}</strong>,</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Yönetmekte olduğunuz yarış başarıyla sonlandırılmıştır. Tekne süreleri aşağıdadır:</p>

        <!-- Full Results Table -->
        <h3 style="color: #0f172a; font-size: 17px; margin: 30px 0 15px 0;">📋 Yarış Sonuçları</h3>
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #475569;">
                <th style="padding: 14px 16px; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Tekne</th>
                <th style="padding: 14px 16px; font-weight: 600; border-bottom: 2px solid #e2e8f0;">Yarışmacı</th>
                <th style="padding: 14px 16px; font-weight: 600; border-bottom: 2px solid #e2e8f0; text-align: right;">Süre / Durum</th>
              </tr>
            </thead>
            <tbody>
              ${rankedApps.map((item, index) => {
                const isEven = index % 2 === 0;
                const bg = isEven ? '#ffffff' : '#f8fafc';
                let timeOrStatus: string;
                if (item.finished) {
                  timeOrStatus = `<span style="color: #166534; font-weight: 600;">${this.formatElapsed(item.finishElapsed)}</span>`;
                } else if (item.resultStatus === ApplicationStatusEnum.DNS) {
                  timeOrStatus = `<span style="color: #b91c1c; font-weight: 600;">DNS</span>`;
                } else if (item.resultStatus === ApplicationStatusEnum.DNF) {
                  timeOrStatus = `<span style="color: #c2410c; font-weight: 600;">DNF</span>`;
                } else if (item.resultStatus === ApplicationStatusEnum.DSQ) {
                  timeOrStatus = `<span style="color: #9d174d; font-weight: 600;">DSQ</span>`;
                } else {
                  timeOrStatus = `<span style="color: #dc2626; font-weight: 600;">${item.resultStatus || '—'}</span>`;
                }
                
                return `
                <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 14px 16px; color: #475569;">${item.app.boatName || '—'}</td>
                  <td style="padding: 14px 16px; color: #475569;">${item.app.name || '—'}</td>
                  <td style="padding: 14px 16px; text-align: right;">${timeOrStatus}</td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.5;">Bu e-posta <strong>Themis Race Tracker</strong> sistemi tarafından otomatik olarak oluşturulmuştur. Lütfen bu mesaja yanıt vermeyiniz.</p>
        </div>
      </div>
    </div>
    `;

    await this.mailService.sendMail(
      referee.email,
      `${race.title} — Yarış Sonuçları`,
      'Yarış başarıyla tamamlandı. Lütfen e-postayı HTML destekleyen bir istemcide görüntüleyin.',
      html
    );
  }

  private formatElapsedClock(elapsedSeconds: number | null | undefined): string {
    if (elapsedSeconds == null) return '-';
    const hours = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60);
    const secs = elapsedSeconds % 60;
    return `${hours > 0 ? String(hours).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private formatPassTime(passedAt: Date | null | undefined): string {
    if (!passedAt) return '-';
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(passedAt));
  }

  private checkpointExportLabel(cp: any, index: number, finishIndex: number): string {
    const id = String(cp?.id || `CP${index + 1}`);
    const kind = String(cp?.kind || cp?.type || '').toLowerCase();
    if (kind === 'start' || index === 0) return `Start (${id})`;
    if (kind === 'finish' || index === finishIndex) return `Finish (${id})`;
    if (kind === 'gate') return `Kapı (${id})`;
    if (kind === 'buoy') return `Şamandıra (${id})`;
    return id;
  }

  private async buildRaceResultsTable(id: string): Promise<{
    raceTitle: string;
    headers: string[];
    rows: string[][];
  }> {
    const race = await this.loadRace(id);
    if (!race.legId) throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');

    const applications = await this.getLegApplications(race.legId);
    const results = await this.resultsRepo.find({ where: { raceId: id } });
    const resultByApp = new Map(results.map((r) => [r.applicationId, r]));

    const allPasses = await this.checkpointPassRepo.find({
      where: { raceId: id },
    });

    const targets = this.getRaceTargets(race);
    const finishIndex = targets.length > 0 ? targets.length - 1 : -1;

    const checkpointHeaders = targets.flatMap((cp, index) => {
      const label = this.checkpointExportLabel(cp, index, finishIndex);
      return [
        `${label} - Geçiş Tarihi/Saati (Türkiye)`,
        `${label} - Yarış Başlangıcından İtibaren Geçen Süre`,
        `${label} - Geçiş Sırası`,
      ];
    });

    const headers = [
      'Sıra',
      'Tekne Adı',
      'Yelken No',
      'Sınıf',
      'Yarışmacı',
      'Durum',
      ...checkpointHeaders,
    ];

    const passesByApp = new Map<string, CheckpointPass[]>();
    for (const pass of allPasses) {
      const list = passesByApp.get(pass.applicationId) ?? [];
      list.push(pass);
      passesByApp.set(pass.applicationId, list);
    }

    const crossingRankByAppAndCheckpoint = new Map<string, number>();
    for (let checkpointIndex = 0; checkpointIndex < targets.length; checkpointIndex += 1) {
      const passesAtCheckpoint = allPasses
        .filter((pass) => pass.checkpointIndex === checkpointIndex)
        .sort((a, b) => {
          const timeDifference = a.passedAt.getTime() - b.passedAt.getTime();
          if (timeDifference !== 0) return timeDifference;
          const elapsedDifference = (a.elapsedSeconds ?? Infinity) - (b.elapsedSeconds ?? Infinity);
          if (elapsedDifference !== 0) return elapsedDifference;
          return a.applicationId.localeCompare(b.applicationId);
        });

      passesAtCheckpoint.forEach((pass, index) => {
        crossingRankByAppAndCheckpoint.set(
          `${pass.applicationId}:${checkpointIndex}`,
          index + 1,
        );
      });
    }

    const sortedApps = [...applications].sort((a, b) => {
      const ap = resultByApp.get(a.id)?.finishPosition;
      const bp = resultByApp.get(b.id)?.finishPosition;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return 0;
    });

    const rows = sortedApps.map((app) => {
      const appPasses = passesByApp.get(app.id) ?? [];
      const passByIndex = new Map(appPasses.map((p) => [p.checkpointIndex, p]));
      const finishPass = finishIndex >= 0 ? passByIndex.get(finishIndex) : undefined;
      const raceResult = resultByApp.get(app.id);

      const penaltyStatuses = [
        RaceResultStatusEnum.DNS,
        RaceResultStatusEnum.DNF,
        RaceResultStatusEnum.DSQ,
      ];
      let statusLabel: string;
      if (raceResult && penaltyStatuses.includes(raceResult.status as RaceResultStatusEnum)) {
        statusLabel = String(raceResult.status);
      } else if (finishPass || raceResult?.status === RaceResultStatusEnum.FINISHED) {
        statusLabel = 'FINISHED';
      } else if (app.status === ApplicationStatusEnum.PENDING) {
        statusLabel = 'WFA';
      } else if (app.status === ApplicationStatusEnum.WITHDRAWN) {
        statusLabel = 'WITHDRAWN';
      } else {
        statusLabel = String(raceResult?.status || app.status || '—');
      }

      const checkpointCells = targets.flatMap((_cp, index) => {
        const pass = passByIndex.get(index);
        if (!pass) return ['-', '-', '-'];
        return [
          this.formatPassTime(pass.passedAt),
          this.formatElapsedClock(pass.elapsedSeconds),
          String(crossingRankByAppAndCheckpoint.get(`${app.id}:${index}`) ?? '-'),
        ];
      });

      return [
        raceResult?.finishPosition != null ? String(raceResult.finishPosition) : '-',
        app.boatName || '',
        app.sailNumber || '',
        app.boat?.boatClass || '',
        app.name || '',
        statusLabel,
        ...checkpointCells,
      ];
    });

    return {
      raceTitle: race.title || 'race',
      headers,
      rows,
    };
  }

  private sanitizeExportFilename(title: string): string {
    const ascii = String(title || 'race')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return ascii || 'race';
  }

  async exportRaceResults(
    id: string,
    format: RaceResultsExportFormat = 'csv',
    user?: SessionUser,
  ): Promise<RaceResultsExportFile> {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');
    if (user) this.assertCanManageRace(race, user);

    const { raceTitle, headers, rows } = await this.buildRaceResultsTable(id);
    const baseName = this.sanitizeExportFilename(raceTitle);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sailing Race Tracker';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Sonuçlar');
      sheet.addRow(headers);
      for (const row of rows) {
        sheet.addRow(row);
      }
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      headerRow.height = 45;
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(rows.length + 1, 1), column: headers.length },
      };
      headers.forEach((_, colIndex) => {
        const column = sheet.getColumn(colIndex + 1);
        let max = String(headers[colIndex] || '').length;
        for (const row of rows) {
          max = Math.max(max, String(row[colIndex] ?? '').length);
        }
        column.width = Math.min(Math.max(max + 2, 10), 36);
      });
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return {
        format: 'xlsx',
        filename: `${baseName}_results.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buffer,
      };
    }

    const escapeCsv = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
    const csvLines = [
      headers.map(escapeCsv).join(';'),
      ...rows.map((row) => row.map(escapeCsv).join(';')),
    ];
    const csv = '\uFEFF' + csvLines.join('\n');
    return {
      format: 'csv',
      filename: `${baseName}_results.csv`,
      contentType: 'text/csv; charset=UTF-8',
      body: Buffer.from(csv, 'utf8'),
    };
  }

  async getPlaybackData(raceId: string) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');
    if (!race.legId) throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');

    const trackPoints = await this.trackPointsRepo.find({
      where: { raceId },
      order: { recordedAt: 'ASC' },
      select: ['boatId', 'lat', 'lng', 'heading', 'speed', 'recordedAt'],
    });

    const applications = await this.applicationsRepo.find({
      where: { legId: race.legId },
      select: ['id', 'boatId', 'boatName', 'sailNumber'],
    });

    const startPasses = await this.checkpointPassRepo.find({
      where: { raceId, checkpointIndex: 0 },
      select: ['applicationId', 'passedAt'],
    });

    const startTimes: Record<string, number> = {};
    startPasses.forEach((p) => {
      const app = applications.find((a) => a.id === p.applicationId);
      if (app?.boatId) {
        startTimes[app.boatId] = p.passedAt.getTime();
      }
    });

    const raceState = (race.raceState ?? {}) as Record<string, unknown>;
    const startedAtIso = typeof raceState.startedAt === 'string' ? raceState.startedAt : null;
    const finishedAtIso = typeof raceState.finishedAt === 'string' ? raceState.finishedAt : null;
    const durationSeconds =
      typeof raceState.durationSeconds === 'number' ? raceState.durationSeconds : null;

    return {
      trackPoints,
      applications,
      startTimes,
      raceTiming: {
        startedAt: startedAtIso,
        finishedAt: finishedAtIso,
        durationSeconds,
      },
    };
  }

  async getLiveTrails(raceId: string, user?: SessionUser) {
    const race = await this.racesRepo.findOne({ where: { id: raceId } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');
    if (!race.legId) throw new BadRequestException('Bu yarış bir ayağa bağlı değil.');
    if (user) this.assertCanManageRace(race, user);

    const applications = await this.applicationsRepo.find({
      where: {
        legId: race.legId,
        status: In([ApplicationStatusEnum.APPROVED, ApplicationStatusEnum.CHECKED_IN]),
      },
      select: ['id', 'boatId'],
    });

    const startPasses = await this.checkpointPassRepo.find({
      where: { raceId, checkpointIndex: 0 },
      select: ['applicationId', 'passedAt'],
    });

    const startTimes: Record<string, number> = {};
    startPasses.forEach((p) => {
      const app = applications.find((a) => a.id === p.applicationId);
      if (app?.boatId) {
        startTimes[app.boatId] = p.passedAt.getTime();
      }
    });

    const boatIdsWithStart = Object.keys(startTimes);
    if (boatIdsWithStart.length === 0) {
      return {};
    }

    const trackPoints = await this.trackPointsRepo.find({
      where: { raceId, boatId: In(boatIdsWithStart) },
      order: { recordedAt: 'ASC' },
      select: ['boatId', 'lat', 'lng', 'recordedAt'],
    });

    const trails: Record<string, [number, number][]> = {};

    trackPoints.forEach(tp => {
      const startTime = startTimes[tp.boatId];
      if (startTime && tp.recordedAt.getTime() >= startTime) {
        if (!trails[tp.boatId]) {
          trails[tp.boatId] = [];
        }
        trails[tp.boatId].push([tp.lng, tp.lat]);
      }
    });

    return trails;
  }
}
