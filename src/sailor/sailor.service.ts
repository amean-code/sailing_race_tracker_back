import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { RaceResult } from '../entities/race-result.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import {
  RaceStatusEnum,
  ApplicationStatusEnum,
  RaceResultStatusEnum,
} from '../common/constants';
import { computeRegistrationState, serializeRace } from '../common/utils/serialize-race';
import { SessionUser } from '../common/decorators';
import { resolveTrackingConfig } from '../common/tracking-config';
import { Boat } from '../entities/boat.entity';

type RaceWithApplication = {
  application: {
    id: string;
    boatName: string;
    sailNumber: string;
    club: string | null;
    status: string;
    createdAt: string;
    finishPosition: number | null;
    fleetSize: number | null;
  };
  race: ReturnType<typeof serializeRace> & {
    registrationOpen?: boolean;
    appliedCount?: number;
    spotsLeft?: number;
    registrationStatus?: string;
  };
};

@Injectable()
export class SailorService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(RaceResult)
    private readonly resultsRepo: Repository<RaceResult>,
    @InjectRepository(CheckpointPass)
    private readonly checkpointPassRepo: Repository<CheckpointPass>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
  ) { }

  private async raceWithCount(race: Race) {
    const applicationCount = race.legId
      ? await this.applicationsRepo.count({ where: { legId: race.legId } })
      : 0;
    const serialized = serializeRace(race);
    const reg = computeRegistrationState(
      {
        status: race.status,
        registrationDeadline: race.leg?.registrationDeadline ?? null,
        capacity: race.leg?.capacity ?? 30,
      },
      applicationCount,
    );
    return { ...serialized, ...reg };
  }

  private mapApplication(
    app: RaceApplication,
    result?: Pick<RaceResult, 'finishPosition' | 'fleetSize' | 'status'> | null,
  ) {
    return {
      id: app.id,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      club: app.club,
      status: result?.status ?? app.status,
      createdAt: app.createdAt.toISOString(),
      finishPosition: result?.finishPosition ?? null,
      fleetSize: result?.fleetSize ?? null,
    };
  }

  private toRaceEntry(
    app: RaceApplication,
    race: RaceWithApplication['race'],
    result?: Pick<RaceResult, 'finishPosition' | 'fleetSize' | 'status'> | null,
  ): RaceWithApplication {
    return {
      application: this.mapApplication(app, result),
      race,
    };
  }

  async getAppliedRaceIds(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: { email },
      select: ['legId'],
    });
    const legIds = [...new Set(applications.map((app) => app.legId).filter(Boolean))];
    if (legIds.length === 0) return [];

    const races = await this.racesRepo.find({
      where: { legId: In(legIds) },
      select: ['id'],
    });
    return races.map((r) => r.id);
  }

  async getActiveRace(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: [
        { email, status: ApplicationStatusEnum.PENDING },
        { email, status: ApplicationStatusEnum.APPROVED },
        { email, status: ApplicationStatusEnum.CHECKED_IN },
      ],
      relations: ['leg'],
      order: { createdAt: 'DESC' },
    });

    if (applications.length === 0) {
      return { activeRace: null, activeRaces: [] };
    }

    const legIds = [...new Set(applications.map((a) => a.legId))];
    const races = await this.racesRepo.find({
      where: { legId: In(legIds) },
      relations: ['course', 'leg'],
    });
    const racesByLeg = new Map<string, Race[]>();
    for (const race of races) {
      if (!race.legId) continue;
      const list = racesByLeg.get(race.legId) ?? [];
      list.push(race);
      racesByLeg.set(race.legId, list);
    }

    const results = await this.resultsRepo.find({
      where: {
        applicationId: In(applications.map((a) => a.id)),
        raceId: In(races.map((r) => r.id)),
      },
    });
    const resultByKey = new Map(
      results.map((r) => [`${r.applicationId}:${r.raceId}`, r]),
    );

    const liveAppStatuses = new Set([
      ApplicationStatusEnum.PENDING,
      ApplicationStatusEnum.APPROVED,
      ApplicationStatusEnum.CHECKED_IN,
    ]);
    const resultWindowMs = 15 * 60 * 1000;

    type ActivePair = { app: RaceApplication; race: Race };
    const activeList: ActivePair[] = [];

    for (const app of applications) {
      if (!liveAppStatuses.has(app.status as ApplicationStatusEnum)) continue;
      if (!app.legId) continue;
      const legRaces = racesByLeg.get(app.legId) ?? [];
      for (const race of legRaces) {
        const raceStatus = race.status;
        if (raceStatus === RaceStatusEnum.IN_PROGRESS || raceStatus === RaceStatusEnum.OPEN) {
          activeList.push({ app, race });
          continue;
        }
        if (raceStatus === RaceStatusEnum.FINISHED || raceStatus === RaceStatusEnum.CANCELLED) {
          const updatedTime = new Date(race.updatedAt).getTime();
          if (Date.now() - updatedTime < resultWindowMs) {
            activeList.push({ app, race });
          }
        }
      }
    }

    if (activeList.length === 0) {
      return { activeRace: null, activeRaces: [] };
    }

    const getRaceSortTime = (pair: ActivePair): number => {
      const scheduled = pair.race.raceState?.scheduledStartAt;
      if (typeof scheduled === 'string') {
        const t = new Date(scheduled).getTime();
        if (!Number.isNaN(t)) return t;
      }
      const start = pair.race.startDate;
      return start ? new Date(start).getTime() : Number.MAX_SAFE_INTEGER;
    };

    const isClosedRace = (pair: ActivePair): boolean => {
      const status = pair.race.status;
      return status === RaceStatusEnum.FINISHED || status === RaceStatusEnum.CANCELLED;
    };

    activeList.sort((a, b) => {
      const aClosed = isClosedRace(a);
      const bClosed = isClosedRace(b);
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return getRaceSortTime(a) - getRaceSortTime(b);
    });

    const appIds = activeList.map((p) => p.app.id);
    const raceIds = [...new Set(activeList.map((p) => p.race.id))];
    const passes = await this.checkpointPassRepo.find({
      where: { applicationId: In(appIds), raceId: In(raceIds) },
      order: { checkpointIndex: 'ASC' },
    });

    const passesByAppRace = new Map<string, any[]>();
    for (const p of passes) {
      const key = `${p.applicationId}:${p.raceId}`;
      if (!passesByAppRace.has(key)) passesByAppRace.set(key, []);
      passesByAppRace.get(key)!.push({
        checkpointIndex: p.checkpointIndex,
        checkpointId: p.checkpointId,
        passedAt: p.passedAt.toISOString(),
        elapsedSeconds: p.elapsedSeconds,
      });
    }

    const mapActiveRace = (pair: ActivePair) => {
      const { app, race } = pair;
      const raceState = race.raceState ?? {};
      const tracking = (raceState.tracking as Record<string, unknown> | undefined) ?? {};
      const startedAt = (raceState.startedAt as string | undefined) ?? null;
      const scheduledStartAt = (raceState.scheduledStartAt as string | undefined) ?? null;
      const courseSnapshot = race.courseSnapshot ?? null;
      const raceResult = resultByKey.get(`${app.id}:${race.id}`);

      const appPasses = passesByAppRace.get(`${app.id}:${race.id}`) || [];
      const activeTargetIndex = appPasses.length > 0 ? Math.max(...appPasses.map(p => p.checkpointIndex)) + 1 : 0;

      const checkpoints =
        (courseSnapshot?.checkpoints as any[]) ??
        (race.course?.checkpoints as any[]) ??
        [];
      const targets = checkpoints.filter((cp: any) => {
        const k = cp.kind || cp.type;
        return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
      });
      const hasFinished = targets.length > 0 && activeTargetIndex >= targets.length;

      let elapsedSeconds = null;
      if (startedAt) {
        elapsedSeconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      } else if (appPasses.length > 0) {
        const startPass = appPasses.find(p => p.checkpointIndex === 0);
        if (startPass) {
          elapsedSeconds = Math.floor((Date.now() - new Date(startPass.passedAt).getTime()) / 1000);
        }
      }

      if (hasFinished) {
        const finishPass = appPasses.find((p) => p.checkpointIndex === targets.length - 1);
        if (finishPass?.elapsedSeconds != null) {
          elapsedSeconds = finishPass.elapsedSeconds;
        }
      }

      const resultStatus = raceResult?.status;
      const applicationStatus =
        hasFinished || resultStatus === RaceResultStatusEnum.FINISHED
          ? 'FINISHED'
          : resultStatus === RaceResultStatusEnum.DNS ||
              resultStatus === RaceResultStatusEnum.DNF ||
              resultStatus === RaceResultStatusEnum.DSQ
            ? resultStatus
            : app.status;

      return {
        raceId: race.id,
        legId: app.legId,
        boatId: app.boatId,
        courseId: race.courseId ?? null,
        courseSnapshot,
        applicationId: app.id,
        applicationStatus,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        raceTitle: race.title || app.leg?.title || '',
        raceStatus: race.status ?? null,
        raceStartedAt: startedAt,
        raceFinishedAt: race.raceState?.finishedAt ?? null,
        scheduledStartAt: scheduledStartAt,
        trackingConfig: resolveTrackingConfig(tracking),
        passedCheckpoints: appPasses,
        activeTargetIndex,
        targetCount: targets.length,
        hasFinished,
        raceElapsedSeconds: Math.max(0, elapsedSeconds ?? 0) > 0 || elapsedSeconds === 0
          ? elapsedSeconds
          : null,
      };
    };

    const activeRaces = activeList.map(mapActiveRace);

    const preferred =
      activeRaces.find((r) => r.raceStatus === RaceStatusEnum.IN_PROGRESS) ||
      activeRaces.find((r) => r.raceStatus === RaceStatusEnum.OPEN && r.scheduledStartAt) ||
      activeRaces[0];

    return {
      activeRace: preferred ?? null,
      activeRaces,
    };
  }

  async getDashboard(user: SessionUser) {
    const email = user?.email?.toLowerCase() || '';
    const now = new Date();

    const applications = await this.applicationsRepo.find({
      where: { email },
      relations: ['leg'],
      order: { createdAt: 'DESC' },
    });

    const legIds = [...new Set(applications.map((a) => a.legId).filter(Boolean))];
    const races = legIds.length
      ? await this.racesRepo.find({
          where: { legId: In(legIds) },
          relations: ['course', 'leg'],
          order: { startDate: 'ASC' },
        })
      : [];

    const raceIds = races.map((r) => r.id);
    const results = raceIds.length
      ? await this.resultsRepo.find({
          where: {
            raceId: In(raceIds),
            applicationId: In(applications.map((a) => a.id)),
          },
        })
      : [];
    const resultByKey = new Map(
      results.map((r) => [`${r.applicationId}:${r.raceId}`, r]),
    );

    const racesByLeg = new Map<string, Race[]>();
    for (const race of races) {
      if (!race.legId) continue;
      const list = racesByLeg.get(race.legId) ?? [];
      list.push(race);
      racesByLeg.set(race.legId, list);
    }

    const registered: RaceWithApplication[] = [];
    for (const app of applications) {
      if (!app.legId) continue;
      const legRaces = racesByLeg.get(app.legId) ?? [];
      for (const race of legRaces) {
        const serialized = await this.raceWithCount(race);
        registered.push(
          this.toRaceEntry(app, serialized, resultByKey.get(`${app.id}:${race.id}`)),
        );
      }
    }

    const appIds = applications.map((a) => a.id);
    let passes: CheckpointPass[] = [];
    if (appIds.length > 0 && raceIds.length > 0) {
      passes = await this.checkpointPassRepo.find({
        where: { applicationId: In(appIds), raceId: In(raceIds) },
      });
    }

    const completed = registered
      .filter((entry) => {
        const status = String(entry.race.status).toLowerCase();
        const isRaceFinished = status === 'finished';
        const isPastEndDate = entry.race.endDate && new Date(entry.race.endDate) < now;

        const entryPasses = passes.filter(
          (p) => p.applicationId === entry.application.id && p.raceId === entry.race.id,
        );
        const maxCp = entryPasses.length > 0 ? Math.max(...entryPasses.map(p => p.checkpointIndex)) : -1;
        const checkpoints =
          (entry.race.courseSnapshot?.checkpoints as any[]) ??
          (entry.race.course?.checkpoints as any[]) ??
          [];
        const targets = checkpoints.filter((cp: any) => {
          const k = cp.kind || cp.type;
          return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
        });
        const totalCps = targets.length;
        const isSailorFinished = totalCps > 0 && maxCp >= totalCps - 1;

        return isRaceFinished || isPastEndDate || isSailorFinished;
      })
      .sort((a, b) => new Date(b.race.endDate || 0).getTime() - new Date(a.race.endDate || 0).getTime());

    const upcoming = registered
      .filter((entry) => !completed.some(c => c.race.id === entry.race.id))
      .sort((a, b) => new Date(a.race.startDate || 0).getTime() - new Date(b.race.startDate || 0).getTime());

    const nextRace = upcoming[0] ?? null;

    const positions = completed
      .map((e) => e.application.finishPosition)
      .filter((p): p is number => p != null && p > 0);

    const podiumCount = positions.filter((p) => p <= 3).length;
    const bestPosition = positions.length ? Math.min(...positions) : null;
    const avgPosition = positions.length
      ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10
      : null;

    const appliedLegIds = new Set(applications.map((a) => a.legId));
    const openRaces = await this.racesRepo.find({
      where: { status: RaceStatusEnum.OPEN },
      relations: ['leg'],
      order: { startDate: 'ASC' },
    });

    const discoverCandidates = openRaces.filter(
      (r) =>
        r.legId != null &&
        !appliedLegIds.has(r.legId) &&
        r.startDate != null &&
        r.startDate > now,
    );
    const discoverRaces = (
      await Promise.all(discoverCandidates.map((r) => this.raceWithCount(r)))
    )
      .filter((race) => race.registrationOpen)
      .slice(0, 5);

    const daysUntilNextRace = nextRace?.race?.startDate
      ? Math.max(
        0,
        Math.ceil(
          (new Date(nextRace.race.startDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
      : null;

    const activeApplicationsCount = applications.filter((a) => a.status === ApplicationStatusEnum.PENDING || a.status === ApplicationStatusEnum.APPROVED || a.status === ApplicationStatusEnum.CHECKED_IN).length;
    const totalBoats = await this.boatsRepo.count({ where: { userId: user.sub } });

    return {
      metrics: {
        totalRegistered: registered.length,
        activeApplicationsCount,
        totalBoats,
        completedCount: completed.length,
        upcomingCount: upcoming.length,
        podiumCount,
        bestPosition,
        avgPosition,
        daysUntilNextRace,
        totalApplications: applications.length,
      },
      nextRace,
      upcomingRaces: upcoming,
      completedRaces: completed,
      discoverRaces,
    };
  }

  async getRaceResults(raceId: string, user: SessionUser) {
    const email = user.email.toLowerCase();

    const race = await this.racesRepo.findOne({
      where: { id: raceId },
      relations: ['leg'],
    });
    if (!race?.legId) {
      return { results: null };
    }

    const app = await this.applicationsRepo.findOne({
      where: { legId: race.legId, email },
    });

    if (!app) {
      return { results: null };
    }

    const raceResult = await this.resultsRepo.findOne({
      where: { applicationId: app.id, raceId },
    });

    const passes = await this.checkpointPassRepo.find({
      where: { applicationId: app.id, raceId },
      order: { checkpointIndex: 'ASC' },
    });

    const fleetSize =
      raceResult?.fleetSize ??
      (await this.applicationsRepo.count({ where: { legId: race.legId } }));

    const raceStartedAt = race.raceState?.startedAt as string | undefined;

    const segments = passes.map((p, idx) => {
      const prevElapsed = idx === 0 ? 0 : (passes[idx - 1].elapsedSeconds ?? 0);
      const segmentSeconds = p.elapsedSeconds != null ? p.elapsedSeconds - prevElapsed : null;
      return {
        checkpointIndex: p.checkpointIndex,
        checkpointId: p.checkpointId,
        passedAt: p.passedAt.toISOString(),
        elapsedSeconds: p.elapsedSeconds,
        segmentSeconds,
        rank: p.rank,
      };
    });

    const totalElapsed = passes.length > 0
      ? passes[passes.length - 1].elapsedSeconds
      : null;

    return {
      results: {
        raceId,
        legId: race.legId,
        raceTitle: race.title,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        finishPosition: raceResult?.finishPosition ?? null,
        fleetSize,
        raceStartedAt: raceStartedAt ?? null,
        totalElapsedSeconds: totalElapsed,
        segments,
        status: raceResult?.status ?? app.status,
      },
    };
  }

  async getMyApplications(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: { email },
      relations: ['leg'],
      order: { createdAt: 'DESC' },
    });

    return applications.map((app) => ({
      id: app.id,
      legId: app.legId,
      raceTitle: app.leg?.title,
      raceStartDate: app.leg?.startDate,
      raceStatus: app.leg?.status,
      refereeName: app.leg?.organizer ?? 'Sistem',
      boatId: app.boatId,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      crewMembers: app.crewMembers,
      status: app.status,
      paymentStatus: app.paymentStatus ?? 'NONE',
      paymentReceiptFileName: app.paymentReceiptFileName,
      paymentReceiptUrl: app.paymentReceiptPath
        ? `/api/applications/${app.id}/payment-receipt`
        : null,
      paymentNote: app.paymentNote,
      paymentReviewedAt: app.paymentReviewedAt ? app.paymentReviewedAt.toISOString() : null,
      createdAt: app.createdAt.toISOString(),
      checkedInAt: app.checkedInAt ? app.checkedInAt.toISOString() : null,
    }));
  }

  async getRaceLeaderboard(raceId: string, user: SessionUser) {
    const email = user?.email?.toLowerCase() || '';
    const race = await this.racesRepo.findOne({
      where: { id: raceId },
      relations: ['course', 'leg'],
    });
    if (!race?.legId) {
      return { leaderboard: [], raceId, total: 0 };
    }

    const myApp = await this.applicationsRepo.findOne({
      where: { legId: race.legId, email },
    });

    const allowedRoles = ['ADMIN', 'COMMITTEE'];
    if (!myApp && !allowedRoles.includes(user.role)) {
      return { leaderboard: [], raceId, total: 0 };
    }

    const applications = await this.applicationsRepo.find({
      where: { legId: race.legId },
      order: { createdAt: 'ASC' },
    });

    if (applications.length === 0) {
      return { leaderboard: [], raceId, total: 0 };
    }

    const results = await this.resultsRepo.find({ where: { raceId } });
    const resultByApp = new Map(results.map((r) => [r.applicationId, r]));

    const allPasses = await this.checkpointPassRepo.find({
      where: { raceId },
      order: { checkpointIndex: 'ASC' },
    });

    const passesByApp = new Map<string, typeof allPasses>();
    for (const pass of allPasses) {
      if (!passesByApp.has(pass.applicationId)) {
        passesByApp.set(pass.applicationId, []);
      }
      passesByApp.get(pass.applicationId)!.push(pass);
    }

    const checkpoints =
      (race.courseSnapshot?.checkpoints as any[]) ??
      (race.course?.checkpoints as any[]) ??
      [];
    const targets = checkpoints.filter((cp: any) => {
      const k = cp.kind || cp.type;
      return k === 'start' || k === 'buoy' || k === 'gate' || k === 'finish';
    });
    const totalCheckpoints = targets.length;
    const finishIndex = totalCheckpoints > 0 ? totalCheckpoints - 1 : -1;

    const leaderboard = applications.map((app, index) => {
      const raceResult = resultByApp.get(app.id);
      const finishPosition = raceResult?.finishPosition ?? null;
      const fleetSize = raceResult?.fleetSize ?? null;
      const appPasses = passesByApp.get(app.id) ?? [];
      const lastPass = appPasses.length > 0
        ? appPasses.reduce((latest, p) => (p.checkpointIndex > latest.checkpointIndex ? p : latest), appPasses[0])
        : null;
      const totalElapsedSeconds = lastPass?.elapsedSeconds ?? null;
      const maxCpIndex = lastPass?.checkpointIndex ?? -1;
      const checkpointsReached = appPasses.length;
      const isFinished =
        (finishIndex >= 0 && maxCpIndex === finishIndex) ||
        finishPosition != null ||
        raceResult?.status === RaceResultStatusEnum.FINISHED;

      let status: string = raceResult?.status ?? app.status;
      if (isFinished && (status === ApplicationStatusEnum.APPROVED || status === ApplicationStatusEnum.CHECKED_IN || status === RaceResultStatusEnum.PENDING)) {
        status = 'FINISHED';
      }

      const displayPosition = finishPosition ?? (index + 1);

      return {
        rank: displayPosition,
        applicationId: app.id,
        name: app.name,
        boatName: app.boatName,
        sailNumber: app.sailNumber,
        club: app.club,
        finishPosition,
        fleetSize,
        totalElapsedSeconds,
        checkpointsReached,
        totalCheckpoints,
        isFinished,
        status,
        isMe: app.email === email,
      };
    });

    leaderboard.sort((a, b) => {
      if (a.finishPosition != null && b.finishPosition != null) return a.finishPosition - b.finishPosition;
      if (a.finishPosition != null) return -1;
      if (b.finishPosition != null) return 1;
      return b.checkpointsReached - a.checkpointsReached;
    });

    leaderboard.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return {
      raceId,
      raceTitle: race.title ?? '',
      raceStatus: race.status ?? '',
      total: leaderboard.length,
      leaderboard,
    };
  }
}
