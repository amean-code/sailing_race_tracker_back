import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

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
      if (app.race.status === RaceStatusEnum.CLOSED) {
        // Include CLOSED races that were updated in the last 15 minutes so clients can see the result popup
        const updatedTime = new Date(app.race.updatedAt).getTime();
        const now = Date.now();
        if (now - updatedTime < 15 * 60 * 1000) return true;
      }
      return false;
    });

    if (activeList.length === 0) {
      return { activeRace: null, activeRaces: [] };
    }

      const mapActiveRace = (app: RaceApplication) => {
      const raceState = app.race?.raceState ?? {};
      const tracking = (raceState.tracking as Record<string, unknown> | undefined) ?? {};
      const startedAt = (raceState.startedAt as string | undefined) ?? null;
      const scheduledStartAt = (raceState.scheduledStartAt as string | undefined) ?? null;
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
        scheduledStartAt: scheduledStartAt,
        trackingConfig: resolveTrackingConfig(tracking),
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
    const email = user.email.toLowerCase();
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

    const completed = registered
      .filter((entry) => new Date(entry.race.endDate) < now)
      .sort((a, b) => new Date(b.race.endDate).getTime() - new Date(a.race.endDate).getTime());

    const upcoming = registered
      .filter((entry) => new Date(entry.race.endDate) >= now)
      .sort((a, b) => new Date(a.race.startDate).getTime() - new Date(b.race.startDate).getTime());

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
}
