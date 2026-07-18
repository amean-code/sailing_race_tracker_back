import { RaceStatusEnum } from '../constants';

export type CourseLike = {
  id: string;
  name: string;
  checkpoints: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type RaceLike = {
  id: string;
  title: string;
  description: string | null;
  location: string;
  venue: string | null;
  startDate: Date;
  endDate: Date;
  registrationDeadline: Date;
  boatClass: string | null;
  capacity: number;
  status: RaceStatusEnum | string;
  organizer: string | null;
  courseId: string | null;
  course?: CourseLike | null;
  raceState?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  applicationCount?: number;
  createdById?: string | null;
};

export type PublicRegistrationStatus =
  | 'open'
  | 'full'
  | 'deadline_passed'
  | 'in_progress'
  | 'suspended'
  | 'closed';

function normalizeRaceStatus(status: RaceStatusEnum | string): RaceStatusEnum {
  return String(status).toUpperCase() as RaceStatusEnum;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function computeRegistrationState(
  race: Pick<RaceLike, 'status' | 'registrationDeadline' | 'capacity'>,
  applicationCount: number,
  now = new Date(),
) {
  const status = normalizeRaceStatus(race.status);
  const deadline = toDate(race.registrationDeadline);
  const spotsLeft = Math.max(0, race.capacity - applicationCount);
  const registrationOpen =
    status === RaceStatusEnum.OPEN &&
    deadline > now &&
    spotsLeft > 0;

  let registrationStatus: PublicRegistrationStatus;
  if (status === RaceStatusEnum.IN_PROGRESS) {
    registrationStatus = 'in_progress';
  } else if (status === RaceStatusEnum.SUSPENDED) {
    registrationStatus = 'suspended';
  } else if (status === RaceStatusEnum.FINISHED) {
    registrationStatus = 'closed';
  } else if (spotsLeft <= 0) {
    registrationStatus = 'full';
  } else if (status === RaceStatusEnum.OPEN && deadline <= now) {
    registrationStatus = 'deadline_passed';
  } else if (registrationOpen) {
    registrationStatus = 'open';
  } else {
    registrationStatus = 'closed';
  }

  return {
    appliedCount: applicationCount,
    spotsLeft,
    registrationOpen,
    registrationStatus,
  };
}

function serializeCourse(course: CourseLike) {
  return {
    id: course.id,
    name: course.name,
    checkpoints: course.checkpoints,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

export function serializeRace(race: RaceLike) {
  const appliedCount = race.applicationCount ?? 0;
  const {
    spotsLeft,
    registrationOpen,
    registrationStatus,
  } = computeRegistrationState(race, appliedCount);

  return {
    id: race.id,
    title: race.title,
    description: race.description,
    location: race.location,
    venue: race.venue,
    startDate: toDate(race.startDate).toISOString(),
    endDate: toDate(race.endDate).toISOString(),
    registrationDeadline: toDate(race.registrationDeadline).toISOString(),
    boatClass: race.boatClass,
    capacity: race.capacity,
    status: normalizeRaceStatus(race.status).toLowerCase(),
    organizer: race.organizer,
    courseId: race.courseId,
    course: race.course ? serializeCourse(race.course) : null,
    raceState: race.raceState ?? {},
    appliedCount,
    spotsLeft,
    registrationOpen,
    registrationStatus,
    createdAt: toDate(race.createdAt).toISOString(),
    updatedAt: toDate(race.updatedAt).toISOString(),
    createdById: race.createdById ?? null,
  };
}
