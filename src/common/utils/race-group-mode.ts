export type RaceGroupModeEntry = {
  groupId: string;
  groupName: string;
  courseId: string | null;
  courseSnapshot?: Record<string, unknown> | null;
  scheduledStartAt: string | null;
  startedAt: string | null;
};

export type RaceGroupMode = {
  sameCourse: boolean;
  sameStart: boolean;
  groups: RaceGroupModeEntry[];
};

export function readGroupMode(
  raceState: Record<string, unknown> | null | undefined,
): RaceGroupMode | null {
  const raw = raceState?.groupMode;
  if (!raw || typeof raw !== 'object') return null;
  const gm = raw as Record<string, unknown>;
  const groups = Array.isArray(gm.groups) ? gm.groups : [];
  const normalized: RaceGroupModeEntry[] = groups
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
    .map((g) => ({
      groupId: String(g.groupId || ''),
      groupName: String(g.groupName || ''),
      courseId: g.courseId != null && g.courseId !== '' ? String(g.courseId) : null,
      courseSnapshot:
        g.courseSnapshot && typeof g.courseSnapshot === 'object'
          ? (g.courseSnapshot as Record<string, unknown>)
          : null,
      scheduledStartAt:
        typeof g.scheduledStartAt === 'string' ? g.scheduledStartAt : null,
      startedAt: typeof g.startedAt === 'string' ? g.startedAt : null,
    }))
    .filter((g) => g.groupId);
  if (normalized.length === 0) return null;
  return {
    sameCourse: Boolean(gm.sameCourse),
    sameStart: Boolean(gm.sameStart),
    groups: normalized,
  };
}

export function findGroupEntry(
  groupMode: RaceGroupMode | null | undefined,
  groupId: string | null | undefined,
): RaceGroupModeEntry | null {
  if (!groupMode || !groupId) return null;
  return groupMode.groups.find((g) => g.groupId === groupId) ?? null;
}

/** Effective start ISO for a competitor's group (falls back to race-level startedAt). */
export function resolveStartedAtForGroup(
  raceState: Record<string, unknown> | null | undefined,
  groupId: string | null | undefined,
): string | null {
  const groupMode = readGroupMode(raceState);
  if (groupMode && !groupMode.sameStart && groupId) {
    const entry = findGroupEntry(groupMode, groupId);
    if (entry?.startedAt) return entry.startedAt;
    return null;
  }
  const raceStarted = raceState?.startedAt;
  return typeof raceStarted === 'string' ? raceStarted : null;
}

export function resolveCourseIdForGroup(
  race: { courseId?: string | null; raceState?: Record<string, unknown> | null },
  groupId: string | null | undefined,
): string | null {
  const groupMode = readGroupMode(race.raceState);
  if (groupMode && !groupMode.sameCourse && groupId) {
    const entry = findGroupEntry(groupMode, groupId);
    if (entry?.courseId) return entry.courseId;
  }
  return race.courseId ?? null;
}

/** Frozen course snapshot for a competitor's group (falls back to race.courseSnapshot). */
export function resolveCourseSnapshotForGroup(
  race: {
    courseSnapshot?: Record<string, unknown> | null;
    raceState?: Record<string, unknown> | null;
  },
  groupId: string | null | undefined,
): Record<string, unknown> | null {
  const groupMode = readGroupMode(race.raceState);
  if (groupMode && !groupMode.sameCourse && groupId) {
    const entry = findGroupEntry(groupMode, groupId);
    if (entry?.courseSnapshot && typeof entry.courseSnapshot === 'object') {
      return entry.courseSnapshot;
    }
  }
  return race.courseSnapshot ?? null;
}

/** Effective scheduled start ISO for a competitor's group. */
export function resolveScheduledStartAtForGroup(
  raceState: Record<string, unknown> | null | undefined,
  groupId: string | null | undefined,
): string | null {
  const groupMode = readGroupMode(raceState);
  if (groupMode && !groupMode.sameStart && groupId) {
    const entry = findGroupEntry(groupMode, groupId);
    if (entry?.scheduledStartAt) return entry.scheduledStartAt;
    return null;
  }
  const scheduled = raceState?.scheduledStartAt;
  return typeof scheduled === 'string' ? scheduled : null;
}

export function writeGroupMode(
  raceState: Record<string, unknown> | null | undefined,
  groupMode: RaceGroupMode | null,
): Record<string, unknown> {
  const next = { ...(raceState || {}) };
  if (!groupMode) {
    delete next.groupMode;
  } else {
    next.groupMode = groupMode;
  }
  return next;
}

export function patchGroupEntry(
  groupMode: RaceGroupMode,
  groupId: string,
  patch: Partial<RaceGroupModeEntry>,
): RaceGroupMode {
  return {
    ...groupMode,
    groups: groupMode.groups.map((g) =>
      g.groupId === groupId ? { ...g, ...patch } : g,
    ),
  };
}

/** Earliest due scheduledStartAt across groups (for race-level pre-start / UI). */
export function earliestGroupScheduledStart(
  groupMode: RaceGroupMode | null,
): string | null {
  if (!groupMode) return null;
  let best: { iso: string; ms: number } | null = null;
  for (const g of groupMode.groups) {
    if (!g.scheduledStartAt || g.startedAt) continue;
    const ms = new Date(g.scheduledStartAt).getTime();
    if (!Number.isFinite(ms)) continue;
    if (!best || ms < best.ms) best = { iso: g.scheduledStartAt, ms };
  }
  return best?.iso ?? null;
}
