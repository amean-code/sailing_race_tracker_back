import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { RaceStatusEnum, ApplicationStatusEnum } from '../common/constants';
import { serializeRace } from '../common/utils/serialize-race';
import { SessionUser } from '../common/decorators';
import { resolveTrackingConfig } from '../common/tracking-config';
import { Boat } from '../entities/boat.entity';

type RaceWithApplication = {
  application: {
    id: string;
    boatName: string;
    sailNumber: string;
    club: string | null;
    createdAt: string;
    finishPosition: number | null;
    fleetSize: number | null;
  };
  race: ReturnType<typeof serializeRace>;
};

@Injectable()
export class SailorService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(CheckpointPass)
    private readonly checkpointPassRepo: Repository<CheckpointPass>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
  ) { }

  private async raceWithCount(race: Race) {
    const applicationCount = await this.applicationsRepo.count({
      where: { raceId: race.id },
    });
    return serializeRace({ ...race, applicationCount });
  }

  private mapApplication(app: RaceApplication) {
    return {
      id: app.id,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      club: app.club,
      createdAt: app.createdAt.toISOString(),
      finishPosition: app.finishPosition,
      fleetSize: app.fleetSize,
    };
  }

  private toRaceEntry(app: RaceApplication, race: ReturnType<typeof serializeRace>): RaceWithApplication {
    return {
      application: this.mapApplication(app),
      race,
    };
  }

  async getAppliedRaceIds(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: { email },
      select: ['raceId'],
    });
    return applications.map((app) => app.raceId);
  }

  async getActiveRace(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: [
        { email, status: ApplicationStatusEnum.PENDING },
        { email, status: ApplicationStatusEnum.APPROVED },
        { email, status: ApplicationStatusEnum.CHECKED_IN },
      ],
      relations: ['race'],
      order: { checkedInAt: 'DESC', createdAt: 'DESC' },
    });

    const activeList = applications.filter((app) => {
      if (!app.race) return false;
      if (app.race.status === RaceStatusEnum.IN_PROGRESS || app.race.status === RaceStatusEnum.OPEN) return true;
      if (app.race.status === RaceStatusEnum.FINISHED) {
        // Include FINISHEDED races that were updated in the last 15 minutes so clients can see the result popup
        const updatedTime = new Date(app.race.updatedAt).getTime();
        const now = Date.now();
        if (now - updatedTime < 15 * 60 * 1000) return true;
      }
      return false;
    });

    if (activeList.length === 0) {
      return { activeRace: null, activeRaces: [] };
    }

    const appIds = activeList.map(app => app.id);
    const passes = await this.checkpointPassRepo.find({
      where: { applicationId: In(appIds) },
      order: { checkpointIndex: 'ASC' },
    });

    const passesByApp = new Map<string, any[]>();
    for (const p of passes) {
      if (!passesByApp.has(p.applicationId)) passesByApp.set(p.applicationId, []);
      passesByApp.get(p.applicationId)!.push({
        checkpointIndex: p.checkpointIndex,
        checkpointId: p.checkpointId,
        passedAt: p.passedAt.toISOString(),
        elapsedSeconds: p.elapsedSeconds,
      });
    }

    const mapActiveRace = (app: RaceApplication) => {
      const raceState = app.race?.raceState ?? {};
      const tracking = (raceState.tracking as Record<string, unknown> | undefined) ?? {};
      const startedAt = (raceState.startedAt as string | undefined) ?? null;
      const scheduledStartAt = (raceState.scheduledStartAt as string | undefined) ?? null;
      
      const appPasses = passesByApp.get(app.id) || [];
      const activeTargetIndex = appPasses.length > 0 ? Math.max(...appPasses.map(p => p.checkpointIndex)) + 1 : 0;
      
      let elapsedSeconds = null;
      if (startedAt) {
        elapsedSeconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      } else if (appPasses.length > 0) {
        const startPass = appPasses.find(p => p.checkpointIndex === 0);
        if (startPass) {
          elapsedSeconds = Math.floor((Date.now() - new Date(startPass.passedAt).getTime()) / 1000);
        }
      }

      return {
        raceId: app.raceId,
        boatId: app.boatId,
        courseId: app.race?.courseId ?? null,
        applicationId: app.id,
        applicationStatus: app.status,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        raceTitle: app.race?.title ?? '',
        raceStatus: app.race?.status ?? null,
        raceStartedAt: startedAt,
        raceFinishedAt: app.race?.raceState?.finishedAt ?? null,
        scheduledStartAt: scheduledStartAt,
        trackingConfig: resolveTrackingConfig(tracking),
        passedCheckpoints: appPasses,
        activeTargetIndex,
        raceElapsedSeconds: Math.max(0, elapsedSeconds ?? 0) > 0 ? elapsedSeconds : null,
      };
    };

    const activeRaces = activeList.map(mapActiveRace);

    // Prefer CHECKED_IN race for the initial active race
    const checkedIn = activeRaces.find((r) => r.applicationStatus === ApplicationStatusEnum.CHECKED_IN);

    return {
      activeRace: checkedIn || activeRaces[0],
      activeRaces,
    };
  }

  async getDashboard(user: SessionUser) {
    const email = user?.email?.toLowerCase() || '';
    const now = new Date();

    const applications = await this.applicationsRepo.find({
      where: { email },
      relations: ['race', 'race.course'],
      order: { createdAt: 'DESC' },
    });

    const registered: RaceWithApplication[] = [];
    for (const app of applications) {
      if (!app.race) continue;
      const race = await this.raceWithCount(app.race);
      registered.push(this.toRaceEntry(app, race));
    }

    const appIds = applications.map((a) => a.id);
    let passes: CheckpointPass[] = [];
    if (appIds.length > 0) {
      passes = await this.checkpointPassRepo.find({
        where: { applicationId: In(appIds) }
      });
    }

    const completed = registered
      .filter((entry) => {
        const isRaceFinished = entry.race.status === RaceStatusEnum.FINISHED;
        const isPastEndDate = entry.race.endDate && new Date(entry.race.endDate) < now;

        // Check if sailor passed all checkpoints
        const entryPasses = passes.filter(p => p.applicationId === entry.application.id);
        const maxCp = entryPasses.length > 0 ? Math.max(...entryPasses.map(p => p.checkpointIndex)) : -1;
        const totalCps = (entry.race.course?.checkpoints as any[])?.length || 0;
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

    const appliedRaceIds = new Set(applications.map((a) => a.raceId));
    const openRaces = await this.racesRepo.find({
      where: { status: RaceStatusEnum.OPEN },
      order: { startDate: 'ASC' },
    });

    const discoverCandidates = openRaces.filter(
      (r) => !appliedRaceIds.has(r.id) && r.startDate > now,
    );
    const discoverRaces = (
      await Promise.all(discoverCandidates.map((r) => this.raceWithCount(r)))
    )
      .filter((race) => race.registrationOpen)
      .slice(0, 5);

    const daysUntilNextRace = nextRace
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

    // Find the application for this user in this race
    const app = await this.applicationsRepo.findOne({
      where: { raceId, email },
      relations: ['race'],
    });

    if (!app || !app.race) {
      return { results: null };
    }

    // Get all checkpoint passes for this application
    const passes = await this.checkpointPassRepo.find({
      where: { applicationId: app.id, raceId },
      order: { checkpointIndex: 'ASC' },
    });

    // Get total competitors who finished (for fleet size context)
    const fleetSize = await this.applicationsRepo.count({ where: { raceId } });

    const raceStartedAt = app.race.raceState?.startedAt as string | undefined;

    // Compute inter-checkpoint segment durations
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
        raceTitle: app.race.title,
        sailNumber: app.sailNumber,
        boatName: app.boatName,
        finishPosition: app.finishPosition,
        fleetSize: app.fleetSize ?? fleetSize,
        raceStartedAt: raceStartedAt ?? null,
        totalElapsedSeconds: totalElapsed,
        segments,
        status: app.status,
      },
    };
  }

  async getMyApplications(user: SessionUser) {
    const email = user.email.toLowerCase();
    const applications = await this.applicationsRepo.find({
      where: { email },
      relations: ['race'],
      order: { createdAt: 'DESC' },
    });

    return applications.map((app) => ({
      id: app.id,
      raceId: app.race?.id,
      raceTitle: app.race?.title,
      raceStartDate: app.race?.startDate,
      raceStatus: app.race?.status,
      refereeName: app.race?.organizer ?? 'Sistem',
      boatId: app.boatId,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      checkedInAt: app.checkedInAt ? app.checkedInAt.toISOString() : null,
    }));
  }

  async getRaceLeaderboard(raceId: string, user: SessionUser) {
    // Verify the requesting user participated in this race (or is admin/committee)
    const email = user?.email?.toLowerCase() || '';
    const myApp = await this.applicationsRepo.findOne({
      where: { raceId, email },
    });

    // Allow access only if the user participated OR has elevated role
    const allowedRoles = ['ADMIN', 'COMMITTEE'];
    if (!myApp && !allowedRoles.includes(user.role)) {
      return { leaderboard: [], raceId, total: 0 };
    }

    // Get all applications for this race
    const applications = await this.applicationsRepo.find({
      where: { raceId },
      relations: ['race'],
      order: { finishPosition: 'ASC', createdAt: 'ASC' },
    });

    if (applications.length === 0) {
      return { leaderboard: [], raceId, total: 0 };
    }

    // Get all checkpoint passes for this race to compute elapsed times
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

    const race = applications[0]?.race;
    const totalCheckpoints = (race?.course as any)?.checkpoints?.length ?? 0;

    const leaderboard = applications.map((app, index) => {
      const appPasses = passesByApp.get(app.id) ?? [];
      const lastPass = appPasses.length > 0
        ? appPasses.reduce((latest, p) => (p.checkpointIndex > latest.checkpointIndex ? p : latest), appPasses[0])
        : null;
      const totalElapsedSeconds = lastPass?.elapsedSeconds ?? null;
      const checkpointsReached = appPasses.length;
      const isFinished = totalCheckpoints > 0 && checkpointsReached >= totalCheckpoints;

      // Assign display position: use stored finishPosition or fallback to array index
      const displayPosition = app.finishPosition ?? (index + 1);

      return {
        rank: displayPosition,
        applicationId: app.id,
        name: app.name,
        boatName: app.boatName,
        sailNumber: app.sailNumber,
        club: app.club,
        finishPosition: app.finishPosition,
        fleetSize: app.fleetSize,
        totalElapsedSeconds,
        checkpointsReached,
        totalCheckpoints,
        isFinished,
        status: app.status,
        isMe: app.email === email,
      };
    });

    // Sort: finished entries by finishPosition ASC, then DNF/pending at the bottom
    leaderboard.sort((a, b) => {
      if (a.finishPosition != null && b.finishPosition != null) return a.finishPosition - b.finishPosition;
      if (a.finishPosition != null) return -1;
      if (b.finishPosition != null) return 1;
      // Both unranked — sort by checkpoints reached desc
      return b.checkpointsReached - a.checkpointsReached;
    });

    // Re-assign visual rank after sort
    leaderboard.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return {
      raceId,
      raceTitle: race?.title ?? '',
      raceStatus: race?.status ?? '',
      total: leaderboard.length,
      leaderboard,
    };
  }
}
