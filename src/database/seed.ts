import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { IsNull } from 'typeorm';
import { AppDataSource } from './data-source';
import { User } from '../entities/user.entity';
import { Course } from '../entities/course.entity';
import { Boat } from '../entities/boat.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { UserRoleEnum, RaceStatusEnum } from '../common/constants';

const defaultCourseData = {
  name: 'Bodrum Bay Offshore',
  checkpoints: [
    { id: 'start', type: 'start', coord: [37.0255, 27.4325], width: 100, rotationDeg: 270, crossing: 'center' },
    { id: 'buoy-1', type: 'buoy', coord: [37.01, 27.4], rounding: 'port' },
    { id: 'buoy-2', type: 'buoy', coord: [36.995, 27.45], rounding: 'starboard' },
    { id: 'finish', type: 'finish', coord: [37.0255, 27.4325], width: 100, rotationDeg: 270, crossing: 'center' },
  ],
};

const sampleRaces = [
  {
    title: 'Bodrum Körfezi Offshore',
    description: 'Bodrum körfezinde tek günlük offshore yarış.',
    location: 'Bodrum, Muğla',
    venue: 'Bodrum Yelken Kulübü',
    startDate: new Date('2026-07-18T10:00:00'),
    endDate: new Date('2026-07-18T18:00:00'),
    registrationDeadline: new Date('2026-08-10T23:59:00'),
    boatClass: 'IRC / ORC',
    capacity: 35,
    status: RaceStatusEnum.OPEN,
    organizer: 'Bodrum Yelken Kulübü',
  },
  {
    title: 'Göcek Bahar Regattası',
    description: 'Üç günlük körfez regattası.',
    location: 'Göcek, Muğla',
    venue: 'D-Marin Göcek',
    startDate: new Date('2026-05-24T11:00:00'),
    endDate: new Date('2026-05-26T17:00:00'),
    registrationDeadline: new Date('2026-08-15T23:59:00'),
    boatClass: 'J70 / ORC Club',
    capacity: 24,
    status: RaceStatusEnum.OPEN,
    organizer: 'Göcek Marina YC',
  },
];

async function ensureAdminUser(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  email: string,
  password: string,
  name: string,
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = UserRoleEnum.ADMIN;
    if (!existing.name) existing.name = name;
    await userRepo.save(existing);
    console.log(`Ensured admin ${email}`);
    return;
  }
  await userRepo.save(
    userRepo.create({
      email,
      passwordHash,
      name,
      role: UserRoleEnum.ADMIN,
    }),
  );
  console.log(`Seeded admin ${email}`);
}

async function ensureCommitteeUser(
  userRepo: ReturnType<typeof AppDataSource.getRepository<User>>,
  email: string,
  password: string,
  name: string,
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = UserRoleEnum.COMMITTEE;
    if (!existing.name) existing.name = name;
    await userRepo.save(existing);
    console.log(`Ensured committee user ${email}`);
    return;
  }
  await userRepo.save(
    userRepo.create({
      email,
      passwordHash,
      name,
      role: UserRoleEnum.COMMITTEE,
    }),
  );
  console.log(`Seeded committee user ${email}`);
}

async function main() {
  await AppDataSource.initialize();
  const userRepo = AppDataSource.getRepository(User);
  const courseRepo = AppDataSource.getRepository(Course);
  const boatRepo = AppDataSource.getRepository(Boat);
  const raceRepo = AppDataSource.getRepository(Race);

  const courseCount = await courseRepo.count();
  let seededCourse: Course | null = null;
  if (courseCount === 0) {
    seededCourse = await courseRepo.save(courseRepo.create(defaultCourseData));
    console.log('Seeded default course');
  } else {
    const courses = await courseRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
    seededCourse = courses[0] ?? null;
  }

  const boatCount = await boatRepo.count();
  if (boatCount === 0) {
    await boatRepo.save(
      boatRepo.create({ id: 'boat-1', name: 'Warp Drive', status: 'racing' }),
    );
    console.log('Seeded default boat boat-1');
  }

  const adminEmail = 'admin@bayk.test';
  if (!(await userRepo.findOne({ where: { email: adminEmail } }))) {
    await userRepo.save(
      userRepo.create({
        email: adminEmail,
        passwordHash: await bcrypt.hash('admin12345', 12),
        name: 'Admin',
        role: UserRoleEnum.ADMIN,
      }),
    );
    console.log('Seeded admin@bayk.test / admin12345');
  }

  await ensureAdminUser(
    userRepo,
    'amean.hesaplar@gmail.com',
    'Amean1415',
    'Amean Admin',
  );

  await ensureAdminUser(
    userRepo,
    'emredgli07@gmail.com',
    '11120617Hed',
    'Emre Admin',
  );

  await ensureCommitteeUser(
    userRepo,
    'emre@hakem.com',
    'hakem123',
    'Emre Hakem',
  );
  await ensureCommitteeUser(
    userRepo,
    'serdar.bilecen@bayk.org',
    'Hakem123',
    'Serdar Bilecen',
  );

  const demoEmail = 'demo@bayk.test';
  if (!(await userRepo.findOne({ where: { email: demoEmail } }))) {
    await userRepo.save(
      userRepo.create({
        email: demoEmail,
        passwordHash: await bcrypt.hash('demo12345', 12),
        name: 'Demo Yarışçı',
        role: UserRoleEnum.SAILOR,
      }),
    );
    console.log('Seeded demo@bayk.test / demo12345');
  }

  const raceCount = await raceRepo.count();
  if (raceCount === 0) {
    for (const race of sampleRaces) {
      await raceRepo.save(
        raceRepo.create({
          ...race,
          courseId: seededCourse?.id ?? null,
        }),
      );
    }
    console.log(`Seeded ${sampleRaces.length} races`);
  } else if (seededCourse) {
    const unlinked = await raceRepo.find({ where: { courseId: IsNull() } });
    for (const race of unlinked) {
      race.courseId = seededCourse.id;
      await raceRepo.save(race);
    }
    if (unlinked.length > 0) {
      console.log(`Linked ${unlinked.length} existing races to default course`);
    }
  }

  const appRepo = AppDataSource.getRepository(RaceApplication);
  const demoUser = await userRepo.findOne({ where: { email: demoEmail } });
  const allRaces = await raceRepo.find({ order: { startDate: 'ASC' } });

  if (demoUser && allRaces.length > 0) {
    const gocek = allRaces.find((r) => r.title.includes('Göcek'));
    const bodrum = allRaces.find((r) => r.title.includes('Bodrum'));

    if (gocek) {
      gocek.status = RaceStatusEnum.CLOSED;
      await raceRepo.save(gocek);

      const existingGocek = await appRepo.findOne({
        where: { raceId: gocek.id, email: demoEmail },
      });
      if (!existingGocek) {
        await appRepo.save(
          appRepo.create({
            raceId: gocek.id,
            name: demoUser.name ?? 'Demo Yarışçı',
            email: demoEmail,
            boatName: 'Rüzgar',
            sailNumber: 'TUR 42',
            club: 'Bodrum YC',
            finishPosition: 3,
            fleetSize: 18,
          }),
        );
        console.log('Seeded demo application for Göcek (3rd of 18)');
      }
    }

    if (bodrum) {
      const existingBodrum = await appRepo.findOne({
        where: { raceId: bodrum.id, email: demoEmail },
      });
      if (!existingBodrum) {
        await appRepo.save(
          appRepo.create({
            raceId: bodrum.id,
            name: demoUser.name ?? 'Demo Yarışçı',
            email: demoEmail,
            boatName: 'Rüzgar',
            sailNumber: 'TUR 42',
            club: 'Bodrum YC',
          }),
        );
        console.log('Seeded demo application for Bodrum');
      }
    }
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
