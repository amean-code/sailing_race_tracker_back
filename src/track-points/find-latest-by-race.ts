/**
 * Pure helpers mirroring PostgreSQL DISTINCT ON (boat_id)
 * ORDER BY boat_id, recorded_at DESC, id DESC semantics.
 */

export type LatestTrackPointRow = {
  id: string;
  boatId: string;
  raceId: string | null;
  recordedAt: Date | string;
};

function recordedAtMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** True if `candidate` is strictly newer than `current` (recorded_at, then id). */
export function isNewerTrackPoint(
  candidate: LatestTrackPointRow,
  current: LatestTrackPointRow,
): boolean {
  const candidateAt = recordedAtMs(candidate.recordedAt);
  const currentAt = recordedAtMs(current.recordedAt);
  if (candidateAt !== currentAt) return candidateAt > currentAt;
  return candidate.id > current.id;
}

/**
 * Filters by raceId and keeps the latest point per boatId.
 * GPS frequency / row count of one boat cannot drop another boat.
 */
export function selectLatestTrackPointsPerBoat<T extends LatestTrackPointRow>(
  points: T[],
  raceId: string,
): T[] {
  const latestByBoat = new Map<string, T>();

  for (const pt of points) {
    if (!pt.boatId || pt.raceId !== raceId) continue;
    const existing = latestByBoat.get(pt.boatId);
    if (!existing || isNewerTrackPoint(pt, existing)) {
      latestByBoat.set(pt.boatId, pt);
    }
  }

  return [...latestByBoat.values()];
}

export function buildLatestByBoatMap<T extends { boatId: string }>(
  points: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const pt of points) {
    if (!pt.boatId) continue;
    map.set(pt.boatId, pt);
  }
  return map;
}
