import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { RaceStatusEnum } from '../common/constants';
import { serializeRace } from '../common/utils/serialize-race';
import { SessionUser } from '../common/decorators';

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

  async getDashboard(user: SessionUser) {
    const email = user.email.toLowerCase();
    const now = new Date();

    const applications = await this.applicationsRepo.find({
      where: { email },
      relations: ['race'],
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

    const discoverRaces = await Promise.all(
      openRaces
        .filter(
          (r) =>
            !appliedRaceIds.has(r.id) &&
            r.registrationDeadline > now &&
            r.startDate > now,
        )
        .slice(0, 5)
        .map((r) => this.raceWithCount(r)),
    );

    const daysUntilNextRace = nextRace
      ? Math.max(
          0,
          Math.ceil(
            (new Date(nextRace.race.startDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    return {
      metrics: {
        totalRegistered: registered.length,
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
}
