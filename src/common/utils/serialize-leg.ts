import { LegKindEnum, RaceStatusEnum } from '../constants';
import { computeRegistrationState, serializeRace, RaceLike } from './serialize-race';

export type TrophySummaryLike = {
  id: string;
  title: string;
};

export type LegLike = {
  id: string;
  title: string;
  description: string | null;
  location: string;
  venue: string | null;
  organizer: string | null;
  boatClass: string | null;
  kind: LegKindEnum | string;
  status: RaceStatusEnum | string;
  startDate: Date | null;
  endDate: Date | null;
  registrationDeadline: Date | null;
  capacity: number;
  assignedCommitteeId?: string | null;
  trophyId?: string | null;
  legOrder?: number | null;
  trophy?: TrophySummaryLike | null;
  createdById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  applicationCount?: number;
  races?: RaceLike[];
};

function normalizeKind(kind?: LegKindEnum | string | null): LegKindEnum {
  const value = String(kind || LegKindEnum.REGATA).toUpperCase();
  if (value === LegKindEnum.TROFE_LEG) return LegKindEnum.TROFE_LEG;
  if (value === LegKindEnum.SINGLE) return LegKindEnum.SINGLE;
  return LegKindEnum.REGATA;
}

function normalizeStatus(status: RaceStatusEnum | string): RaceStatusEnum {
  return String(status).toUpperCase() as RaceStatusEnum;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function serializeLeg(leg: LegLike) {
  const appliedCount = leg.applicationCount ?? 0;
  const { spotsLeft, registrationOpen, registrationStatus } = computeRegistrationState(
    {
      status: leg.status,
      registrationDeadline: leg.registrationDeadline,
      capacity: leg.capacity,
    },
    appliedCount,
  );
  const kind = normalizeKind(leg.kind);

  return {
    id: leg.id,
    title: leg.title,
    description: leg.description,
    location: leg.location,
    venue: leg.venue,
    organizer: leg.organizer,
    boatClass: leg.boatClass,
    kind: kind.toLowerCase(),
    status: normalizeStatus(leg.status).toLowerCase(),
    startDate: leg.startDate ? toDate(leg.startDate).toISOString() : null,
    endDate: leg.endDate ? toDate(leg.endDate).toISOString() : null,
    registrationDeadline: leg.registrationDeadline
      ? toDate(leg.registrationDeadline).toISOString()
      : null,
    capacity: leg.capacity,
    assignedCommitteeId: leg.assignedCommitteeId ?? null,
    trophyId: leg.trophyId ?? null,
    legOrder: leg.legOrder ?? null,
    trophy: leg.trophy
      ? { id: leg.trophy.id, title: leg.trophy.title }
      : leg.trophyId
        ? { id: leg.trophyId, title: '' }
        : null,
    appliedCount,
    spotsLeft,
    registrationOpen,
    registrationStatus,
    raceCount: leg.races?.length ?? 0,
    races: (leg.races ?? []).map((race) => serializeRace(race)),
    createdAt: toDate(leg.createdAt).toISOString(),
    updatedAt: toDate(leg.updatedAt).toISOString(),
    createdById: leg.createdById ?? null,
  };
}
