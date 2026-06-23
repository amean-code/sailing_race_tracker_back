import { RaceStatusEnum } from '../constants';

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
  createdAt: Date;
  updatedAt: Date;
  applicationCount?: number;
};

export function serializeRace(race: RaceLike) {
  const appliedCount = race.applicationCount ?? 0;
  const spotsLeft = Math.max(0, race.capacity - appliedCount);
  const registrationOpen =
    race.status === 'OPEN' &&
    race.registrationDeadline > new Date() &&
    spotsLeft > 0;

  return {
    id: race.id,
    title: race.title,
    description: race.description,
    location: race.location,
    venue: race.venue,
    startDate: race.startDate.toISOString(),
    endDate: race.endDate.toISOString(),
    registrationDeadline: race.registrationDeadline.toISOString(),
    boatClass: race.boatClass,
    capacity: race.capacity,
    status: String(race.status).toLowerCase(),
    organizer: race.organizer,
    courseId: race.courseId,
    appliedCount,
    spotsLeft,
    registrationOpen,
    createdAt: race.createdAt.toISOString(),
    updatedAt: race.updatedAt.toISOString(),
  };
}
