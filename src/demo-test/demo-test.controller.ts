import { Controller, Post, Get, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { Boat } from '../entities/boat.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { User } from '../entities/user.entity';
import { RaceStatusEnum } from '../common/constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrentUser, SessionUser, Public } from '../common/decorators';
import { TrackPointsService } from '../track-points/track-points.service';
import * as turf from '@turf/turf';

@Controller('demo')
export class DemoTestController {
  private readonly logger = new Logger(DemoTestController.name);
  private activeSimulations = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Race) private racesRepo: Repository<Race>,
    @InjectRepository(Course) private coursesRepo: Repository<Course>,
    @InjectRepository(Boat) private boatsRepo: Repository<Boat>,
    @InjectRepository(RaceApplication) private appsRepo: Repository<RaceApplication>,
    @InjectRepository(TrackPoint) private trackPointsRepo: Repository<TrackPoint>,
    @InjectRepository(AuditLog) private auditLogsRepo: Repository<AuditLog>,
    @InjectRepository(CheckpointPass) private cpPassRepo: Repository<CheckpointPass>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private eventEmitter: EventEmitter2,
    private trackPointsService: TrackPointsService,
  ) {}

  @Post('setup')
  async setupDemoRace(@CurrentUser() user: SessionUser) {
    this.logger.log('Setting up Demo Test Race environment...');

    // 1. Clear old demo data
    const oldDemoRaces = await this.racesRepo.find({ where: { title: 'DEMO TEST RACE' } });
    for (const r of oldDemoRaces) {
      await this.trackPointsRepo.delete({ raceId: r.id });
      await this.cpPassRepo.delete({ raceId: r.id });
      await this.appsRepo.delete({ raceId: r.id });
      await this.auditLogsRepo.delete({ raceId: r.id });
      await this.racesRepo.delete(r.id);
    }
    
    // 2. Clear old demo courses
    await this.coursesRepo.delete({ name: 'DEMO TEST COURSE' });

    // 3. Create Demo Course
    const course = this.coursesRepo.create({
      name: 'DEMO TEST COURSE',
      checkpoints: [
        { id: 'start', type: 'start', coords: [[37.00, 27.00], [37.00, 27.01]], kind: 'start' },
        { id: 'cp1', type: 'buoy', coord: [37.01, 27.005], rounding: 'port' },
        { id: 'cp2', type: 'buoy', coord: [37.02, 27.005], rounding: 'starboard' },
        { id: 'cp3', type: 'buoy', coord: [37.03, 27.005], rounding: 'port' },
        { id: 'finish', type: 'finish', coords: [[37.04, 27.00], [37.04, 27.01]], kind: 'finish' },
      ],
    });
    const savedCourse = await this.coursesRepo.save(course);

    // 4. Create Demo Race
    const race = this.racesRepo.create({
      title: 'DEMO TEST RACE',
      description: 'E2E Testing environment race.',
      location: 'Test Location',
      venue: 'Test Venue',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000), // +1 day
      registrationDeadline: new Date(),
      boatClass: 'TEST',
      capacity: 10,
      status: RaceStatusEnum.OPEN,
      courseId: savedCourse.id,
      organizer: user?.sub ?? 'System Tester',
    });
    const savedRace = await this.racesRepo.save(race);

    // 5. Ensure Demo Boat & User
    let testBoat = await this.boatsRepo.findOne({ where: { id: 'demo-test-boat' } });
    if (!testBoat) {
      testBoat = await this.boatsRepo.save(this.boatsRepo.create({ id: 'demo-test-boat', name: 'Test Boat', status: 'racing' }));
    }

    let demoUser = await this.usersRepo.findOne({ where: { email: 'demo@bayk.test' } });
    
    // 6. Create Application
    const app = this.appsRepo.create({
      raceId: savedRace.id,
      boatId: testBoat.id,
      email: demoUser?.email ?? 'demo@bayk.test',
      name: demoUser?.name ?? 'Demo Sailor',
      boatName: 'Test Boat',
      sailNumber: 'TEST-123',
      club: 'Test Club',
      status: 'CHECKED_IN' as any,
    });
    const savedApp = await this.appsRepo.save(app);

    // Notify listeners that race is set up
    this.eventEmitter.emit('demo.setup.complete', { raceId: savedRace.id });

    return {
      message: 'Demo setup complete',
      race: savedRace,
      course: savedCourse,
      application: savedApp,
      boat: testBoat,
    };
  }

  @Get('metrics')
  async getMetrics() {
    const demoRace = await this.racesRepo.findOne({ where: { title: 'DEMO TEST RACE' }, order: { createdAt: 'DESC' } });
    if (!demoRace) return { error: 'No demo race found' };

    const auditLogs = await this.auditLogsRepo.count({ where: { raceId: demoRace.id } });
    const trackPoints = await this.trackPointsRepo.count({ where: { raceId: demoRace.id } });
    const cpPasses = await this.cpPassRepo.count({ where: { raceId: demoRace.id } });

    return {
      raceId: demoRace.id,
      counts: {
        auditLogs,
        trackPoints,
        cpPasses,
      }
    };
  }

  @Public()
  @Post('delete-3d-demo')
  async delete3DDemo() {
    this.logger.log('Deleting 3D Demo Race...');
    
    for (const [id, interval] of this.activeSimulations.entries()) {
      clearInterval(interval);
    }
    this.activeSimulations.clear();

    const oldDemoRaces = await this.racesRepo.find({ where: { title: '3D DEMO RACE' } });
    for (const r of oldDemoRaces) {
      await this.trackPointsRepo.delete({ raceId: r.id });
      await this.cpPassRepo.delete({ raceId: r.id });
      await this.appsRepo.delete({ raceId: r.id });
      await this.auditLogsRepo.delete({ raceId: r.id });
      await this.racesRepo.delete(r.id);
    }
    await this.coursesRepo.delete({ name: '3D DEMO COURSE' });
    
    return { message: '3D Demo Race Deleted' };
  }

  @Public()
  @Post('run-3d-demo')
  async run3DDemo() {
    this.logger.log('Setting up 3D Demo Race with 3 boats...');

    let savedCourse = await this.coursesRepo.findOne({ where: { name: '3D DEMO COURSE' } });
    if (!savedCourse) {
      const course = this.coursesRepo.create({
        name: '3D DEMO COURSE',
        checkpoints: [
          { id: 'start', type: 'start', coords: [[37.034, 27.420], [37.034, 27.425]], kind: 'start', crossing: 'up' },
          { id: 'cp1', type: 'buoy', coord: [37.045, 27.422], rounding: 'starboard', kind: 'buoy' },
          { id: 'cp2', type: 'buoy', coord: [37.050, 27.430], rounding: 'port', kind: 'buoy' },
          { id: 'cp3', type: 'buoy', coord: [37.045, 27.435], rounding: 'starboard', kind: 'buoy' },
          { id: 'finish', type: 'finish', coords: [[37.035, 27.435], [37.035, 27.440]], kind: 'finish', crossing: 'down' },
        ],
      });
      savedCourse = await this.coursesRepo.save(course);
    }

    let savedRace = await this.racesRepo.findOne({ where: { title: '3D DEMO RACE' } });
    if (!savedRace) {
      const race = this.racesRepo.create({
        title: '3D DEMO RACE',
        description: 'Live 3D test race.',
        location: 'Bodrum',
        venue: 'Marina',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        registrationDeadline: new Date(),
        boatClass: 'TEST',
        capacity: 10,
        status: RaceStatusEnum.IN_PROGRESS,
        courseId: savedCourse.id,
        organizer: 'System Tester',
        raceState: { state: 'STARTED', startedAt: new Date().toISOString() }
      });
      savedRace = await this.racesRepo.save(race);
    }

    // Clean up old points for this race so it starts fresh
    await this.trackPointsRepo.delete({ raceId: savedRace.id });

    const demoBoats = [
      { id: 'demo-3d-1', name: 'Alpha', color: '#ef4444' },
      { id: 'demo-3d-2', name: 'Beta', color: '#3b82f6' },
      { id: 'demo-3d-3', name: 'Gamma', color: '#22c55e' },
    ];

    for (const b of demoBoats) {
      let testBoat = await this.boatsRepo.findOne({ where: { id: b.id } });
      if (!testBoat) {
        testBoat = await this.boatsRepo.save(this.boatsRepo.create({ id: b.id, name: b.name, status: 'racing', displayColor: b.color }));
      }
      const existingApp = await this.appsRepo.findOne({ where: { raceId: savedRace.id, boatId: testBoat.id } });
      if (!existingApp) {
        await this.appsRepo.save(this.appsRepo.create({
          raceId: savedRace.id,
          boatId: testBoat.id,
          email: `${b.id}@demo.test`,
          name: `Capt ${b.name}`,
          boatName: b.name,
          sailNumber: `TUR-${Math.floor(Math.random() * 1000)}`,
          club: 'Demo Club',
          status: 'CHECKED_IN' as any,
        }));
      }
    }

    // Start background simulation
    this.startSimulation(savedRace.id, savedCourse, demoBoats);

    return { message: '3D Demo Race Started', raceId: savedRace.id };
  }

  private startSimulation(raceId: string, course: Course, boats: any[]) {
    // Generate route path
    const pts = [
      [27.4225, 37.034], // Mid start
      [27.422, 37.045], // CP1
      [27.430, 37.050], // CP2
      [27.435, 37.045], // CP3
      [27.4375, 37.035], // Mid finish
    ];
    
    const line = turf.lineString(pts);
    const totalLength = turf.length(line, { units: 'kilometers' });

    // Different speeds for boats (sped up 10x for demo purposes)
    const boatSpeeds = [
      { id: boats[0].id, speedKmh: 150, currentDist: 0 },
      { id: boats[1].id, speedKmh: 120, currentDist: 0 },
      { id: boats[2].id, speedKmh: 100, currentDist: 0 },
    ];

    const tickMs = 1000;
    
    const interval = setInterval(async () => {
      const pointsToSync = [];
      let allFinished = true;

      for (const b of boatSpeeds) {
        if (b.currentDist >= totalLength) continue;
        allFinished = false;

        const distKmPerTick = (b.speedKmh / 3600) * (tickMs / 1000);
        b.currentDist += distKmPerTick;
        if (b.currentDist > totalLength) b.currentDist = totalLength;

        const pt = turf.along(line, b.currentDist, { units: 'kilometers' });
        const [lng, lat] = pt.geometry.coordinates;

        let heading = 0;
        if (b.currentDist < totalLength) {
           const nextPt = turf.along(line, b.currentDist + 0.01, { units: 'kilometers' });
           heading = turf.bearing(pt, nextPt);
        }

        pointsToSync.push({
          boatId: b.id,
          raceId: raceId,
          lat,
          lng,
          heading: (heading + 360) % 360,
          speed: b.speedKmh * 0.539957, // kmh to knots
          recordedAt: new Date().toISOString(),
        });
      }

      if (pointsToSync.length > 0) {
        await this.trackPointsService.syncBatch(pointsToSync);
      }

      if (allFinished) {
        // Reset simulation to start!
        this.logger.log(`3D Demo Simulation Finished, resetting...`);
        for (const b of boatSpeeds) {
          b.currentDist = 0;
        }
        await this.trackPointsRepo.delete({ raceId: raceId });
      }
    }, tickMs);

    if (this.activeSimulations.has(raceId)) {
      clearInterval(this.activeSimulations.get(raceId));
    }
    this.activeSimulations.set(raceId, interval);
  }
}
