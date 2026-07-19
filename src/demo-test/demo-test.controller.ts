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
import { CurrentUser, SessionUser } from '../common/decorators';

@Controller('demo')
export class DemoTestController {
  private readonly logger = new Logger(DemoTestController.name);

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
}
