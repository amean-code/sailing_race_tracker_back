import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { User } from '../entities/user.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { RaceStatusEnum, NotificationEventEnum, CourseStatusEnum, UserRoleEnum } from '../common/constants';
import { SessionUser } from '../common/decorators';
import { serializeRace, RaceLike } from '../common/utils/serialize-race';
import {
  CreateRaceDto,
  RaceApplicationDto,
  UpdateRaceDto,
} from './dto/race.dto';
import { RecordCheckpointPassDto } from './dto/checkpoint-pass.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../notifications/mail.service';

import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class RacesService {
  constructor(
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(CheckpointPass)
    private readonly checkpointPassRepo: Repository<CheckpointPass>,
    @InjectRepository(Course)
    private readonly coursesRepo: Repository<Course>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private eventEmitter: EventEmitter2,
  ) { }

  private async withCount(race: Race) {
    const applicationCount = await this.applicationsRepo.count({
      where: { raceId: race.id },
    });
    return serializeRace({ ...race, applicationCount } as RaceLike);
  }

  async findAllManage(user?: SessionUser, status?: string) {
    const whereCondition: any = user?.role === UserRoleEnum.COMMITTEE
      ? { createdById: user.sub }
      : {};

    if (status) {
      const statuses = status.split(',');
      whereCondition.status = In(statuses);
    }

    const races = await this.racesRepo.find({
      where: whereCondition,
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
        { status: RaceStatusEnum.FINISHED },
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
    if (dto.courseId) {
      const course = await this.coursesRepo.findOne({ where: { id: dto.courseId } });
      if (!course) throw new NotFoundException('Seçilen parkur bulunamadı.');
    }

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
    this.eventEmitter.emit('race.created', {
      raceId: saved.id,
      userId: createdById,
      description: `Yarış oluşturuldu: ${saved.title}`,
    });
    return result;
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

  async update(id: string, dto: UpdateRaceDto, user?: SessionUser) {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const isDemoRace = race.title === 'DEMO TEST RACE';

    if (!isDemoRace) {
      if (!user || !['COMMITTEE', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        throw new ForbiddenException('Bu işlem için yetkiniz yok');
      }
      if (user.role === UserRoleEnum.COMMITTEE && race.createdById !== user.sub) {
        throw new ForbiddenException('Sadece kendi oluşturduğunuz yarışı düzenleyebilirsiniz.');
      }
    }

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
    if (dto.organizer !== undefined) race.organizer = dto.organizer ?? null;
    if (dto.courseId !== undefined) {
      if (dto.courseId) {
        const course = await this.coursesRepo.findOne({ where: { id: dto.courseId } });
        if (!course) throw new NotFoundException('Seçilen parkur bulunamadı.');
      }
      race.courseId = dto.courseId ?? null;
    }
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

    return result;
  }

  async remove(id: string, user?: SessionUser) {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE && race.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi oluşturduğunuz yarışı silebilirsiniz.');
    }

    const ctx = {
      raceTitle: race.title,
      raceLocation: race.location,
    };

    const result = await this.racesRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Yarış silinemedi');

    this.notificationsService.dispatchAsync(NotificationEventEnum.RACE_DELETED, ctx);
    return { ok: true };
  }

  async cloneRace(id: string, createdById: string) {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    const clone = this.racesRepo.create({
      title: `[KOPYA] ${race.title}`,
      description: race.description,
      location: race.location,
      venue: race.venue,
      startDate: race.startDate,
      endDate: race.endDate,
      registrationDeadline: race.registrationDeadline,
      boatClass: race.boatClass,
      capacity: race.capacity,
      status: RaceStatusEnum.DRAFT,
      organizer: race.organizer,
      courseId: race.courseId,
      raceState: {},
      createdById,
    });
    const saved = await this.racesRepo.save(clone);
    return this.findOne(saved.id);
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

  async recordCheckpointPass(raceId: string, dto: RecordCheckpointPassDto, user?: SessionUser) {
    const race = await this.racesRepo.findOne({
      where: { id: raceId },
      relations: ['course'],
    });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE && race.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi yarışınıza müdahale edebilirsiniz.');
    }

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

  async getStandings(raceId: string, user?: SessionUser) {
    const race = await this.racesRepo.findOne({ where: { id: raceId }, relations: ['course'] });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE && race.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi yarışınızın sıralamasına müdahale edebilirsiniz.');
    }

    const applications = await this.applicationsRepo.find({
      where: { raceId, status: 'CHECKED_IN' },
      relations: ['boat'],
      order: { createdAt: 'ASC' },
    });

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

    let finishIndex = -1;
    if (race.course?.checkpoints) {
      const checkpoints = race.course.checkpoints as any[];
      const targets = checkpoints.filter(cp => {
        const k = cp.kind || cp.type;
        return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
      });
      finishIndex = targets.length - 1;
    }

    const standings = applications.map((app) => {
      const best = bestPassByApp.get(app.id) ?? null;
      const appPasses = (allPassesByApp.get(app.id) ?? [])
        .sort((a, b) => a.checkpointIndex - b.checkpointIndex);

      const elapsedNow = raceStartedAt
        ? Math.floor((Date.now() - new Date(raceStartedAt).getTime()) / 1000)
        : null;

      const isFinished = best?.checkpointIndex === finishIndex && finishIndex !== -1;

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
        finished: isFinished,
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

    if (race.createdById) {
      const referee = await this.usersRepo.findOne({ where: { id: race.createdById } });
      if (referee && referee.email) {
        this.sendResultsEmail(race, referee, rankedApps).catch(e => 
          console.error('Sonuç maili gönderilemedi:', e)
        );
      }
    }
  }

  private async sendResultsEmail(race: Race, referee: User, rankedApps: any[]) {
    let html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">`;
    html += `<h2 style="color: #1e293b;">${race.title} - Kesinleşen Yarış Sonuçları</h2>`;
    html += `<p style="color: #475569; font-size: 15px;">Merhaba ${referee.name || 'Hakem'},</p>`;
    html += `<p style="color: #475569; font-size: 15px;">Yönettiğiniz yarış başarıyla tamamlandı. Aşağıda kesinleşen yarış sonuç tablosunu bulabilirsiniz:</p>`;
    html += `<table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
      <thead>
        <tr style="background-color: #f8fafc; text-align: left;">
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Sıra</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Tekne</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Yarışmacı</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Durum</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Süre</th>
        </tr>
      </thead>
      <tbody>`;
    
    for (const item of rankedApps) {
      const statusText = item.finished ? 'Bitti' : 'DNF';
      const timeText = item.finished ? `${item.finishElapsed} sn` : '-';
      html += `<tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">#${item.app.finishPosition}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${item.app.boatName || '-'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${item.app.name || '-'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${statusText}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${timeText}</td>
      </tr>`;
    }
    
    html += `</tbody></table>`;
    html += `<p style="color: #64748b; font-size: 13px; margin-top: 30px;">Themis Race Tracker Otomatik Bilgilendirme Sistemi</p>`;
    html += `</div>`;

    await this.mailService.sendMail(
      referee.email,
      `${race.title} — Yarış Sonuçları`,
      'Yarış başarıyla tamamlandı ve sonuçlar kesinleşti. Lütfen e-postayı HTML formatında görüntüleyin.',
      html
    );
  }

  async exportRaceResults(id: string, user?: SessionUser): Promise<string> {
    const race = await this.racesRepo.findOne({ where: { id } });
    if (!race) throw new NotFoundException('Yarış bulunamadı');

    if (user?.role === UserRoleEnum.COMMITTEE && race.createdById !== user.sub) {
      throw new ForbiddenException('Sadece kendi yarışınızın sonuçlarını dışa aktarabilirsiniz.');
    }

    const applications = await this.applicationsRepo.find({
      where: { raceId: id, status: 'checked_in' },
      relations: ['boat'],
    });

    const headers = ['Tekne Adi', 'Yelken No', 'Yarismaci', 'Bitis Zamani', 'Bitis Pozisyonu', 'Durum'];
    const rows = applications.map(app => {
      const finishPos = app.finishPosition ? String(app.finishPosition) : '-';
      const finishTime = app.checkedInAt ? new Date(app.checkedInAt).toLocaleString('tr-TR') : '-';
      return [
        `"${app.boatName || ''}"`,
        `"${app.sailNumber || ''}"`,
        `"${app.name || ''}"`,
        `"${finishTime}"`,
        `"${finishPos}"`,
        `"${app.status}"`
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
