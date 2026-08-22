import { RaceStatusEnum } from '../constants';

export type CourseLike = {
  id: string;
  name: string;
  checkpoints: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type LegSummaryLike = {
  id: string;
  title: string;
  kind?: string;
  trophyId?: string | null;
};

export type RaceLike = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: RaceStatusEnum | string;
  legId?: string | null;
  raceOrder?: number | null;
  leg?: LegSummaryLike | null;
  courseId: string | null;
  courseIds?: string[];
  course?: CourseLike | null;
  courseSnapshot?: Record<string, unknown> | null;
  raceState?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string | null;
  location?: string | null;
  venue?: string | null;
  registrationDeadline?: Date | null;
  boatClass?: string | null;
  capacity?: number | null;
  organizer?: string | null;
  assignedCommitteeId?: string | null;
  applicationCount?: number;
  trophyId?: string | null;
  legOrder?: number | null;
  type?: string | null;
  trophy?: { id: string; title: string } | null;
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
  const deadline = race.registrationDeadline ? toDate(race.registrationDeadline) : null;
  const capacity = race.capacity ?? 30;
  const spotsLeft = Math.max(0, capacity - applicationCount);
  const registrationOpen =
    status === RaceStatusEnum.OPEN &&
    spotsLeft > 0 &&
    (deadline === null || deadline > now);

  let registrationStatus: PublicRegistrationStatus;
  if (status === RaceStatusEnum.IN_PROGRESS) {
    registrationStatus = 'in_progress';
  } else if (status === RaceStatusEnum.SUSPENDED) {
    registrationStatus = 'suspended';
  } else if (status === RaceStatusEnum.FINISHED) {
    registrationStatus = 'closed';
  } else if (spotsLeft <= 0) {
    registrationStatus = 'full';
  } else if (status === RaceStatusEnum.OPEN && deadline !== null && deadline <= now) {
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
  return {
    id: race.id,
    title: race.title,
    description: race.description,
    startDate: race.startDate ? toDate(race.startDate).toISOString() : null,
    endDate: race.endDate ? toDate(race.endDate).toISOString() : null,
    status: normalizeRaceStatus(race.status).toLowerCase(),
    legId: race.legId ?? null,
    raceOrder: race.raceOrder ?? null,
    leg: race.leg
      ? {
          id: race.leg.id,
          title: race.leg.title,
          kind: race.leg.kind ?? null,
          trophyId: race.leg.trophyId ?? null,
        }
      : null,
    courseId: race.courseId,
    courseIds: race.courseIds ?? [],
    course: race.course ? serializeCourse(race.course) : null,
    courseSnapshot: race.courseSnapshot ?? null,
    raceState: race.raceState ?? {},
    createdAt: toDate(race.createdAt).toISOString(),
    updatedAt: toDate(race.updatedAt).toISOString(),
    createdById: race.createdById ?? null,
  };
}
