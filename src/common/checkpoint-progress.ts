export const CHECKPOINT_NOT_PASSED_LABEL = 'Geçilmedi';
export const COMMITTEE_PASS_LABEL = 'Hakem onayı';
export const CHECKPOINT_PASS_SOURCE_GPS = 'gps';
export const CHECKPOINT_PASS_SOURCE_COMMITTEE = 'committee';

export function passedIndexSet(passes: Array<{ checkpointIndex: number }>): Set<number> {
  return new Set(passes.map((pass) => pass.checkpointIndex));
}

export function firstUnpassedIndex(passed: Set<number>, targetCount: number): number {
  for (let index = 0; index < targetCount; index += 1) {
    if (!passed.has(index)) return index;
  }
  return targetCount;
}

export function allCheckpointsPassed(passed: Set<number>, targetCount: number): boolean {
  if (targetCount <= 0) return false;
  for (let index = 0; index < targetCount; index += 1) {
    if (!passed.has(index)) return false;
  }
  return true;
}

export function missedCheckpointIndexes(passed: Set<number>, targetCount: number): number[] {
  const missed: number[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    if (!passed.has(index)) missed.push(index);
  }
  return missed;
}

/**
 * GPS detection candidates for this boat.
 * Start must be passed first. After start, all unpassed marks are eligible
 * except finish, which is gated until the next expected mark is finish or a skip
 * has already been recorded (a later index passed while an earlier one is missing).
 */
export function getCandidateCheckpointIndexes(passed: Set<number>, targetCount: number): number[] {
  if (targetCount <= 0) return [];
  if (!passed.has(0)) return [0];

  const finishIndex = targetCount - 1;
  const nextUnpassed = firstUnpassedIndex(passed, targetCount);
  if (nextUnpassed >= targetCount) return [];

  const skipDetected = [...passed].some((index) => index > nextUnpassed);
  const allowFinish = nextUnpassed === finishIndex || skipDetected;

  const candidates: number[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    if (passed.has(index)) continue;
    if (index === finishIndex && !allowFinish) continue;
    candidates.push(index);
  }
  return candidates;
}

export function checkpointDisplayLabel(
  checkpoint: { name?: string | null; id?: string | null } | null | undefined,
  index: number,
): string {
  const name = typeof checkpoint?.name === 'string' ? checkpoint.name.trim() : '';
  if (name) return name;
  return String(index + 1);
}

function isNumericLabel(label: string): boolean {
  return /^\d+$/.test(label);
}

export function formatMissedCheckpointReason(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) {
    const label = labels[0];
    return isNumericLabel(label)
      ? `${label} numaralı checkpointten geçmediği için DNF`
      : `${label} checkpointinden geçmediği için DNF`;
  }
  const formatted = labels.map((label) => (isNumericLabel(label) ? `${label} numaralı` : label));
  const head = formatted.slice(0, -1).join(', ');
  const last = formatted[formatted.length - 1];
  return `${head} ve ${last} checkpointlerinden geçmediği için DNF`;
}

export function buildMissedCheckpoints(
  targets: Array<{ id?: string | null; name?: string | null }>,
  passed: Set<number>,
): Array<{ index: number; id: string | null; name: string | null; label: string }> {
  return missedCheckpointIndexes(passed, targets.length).map((index) => {
    const target = targets[index];
    const name = typeof target?.name === 'string' && target.name.trim() ? target.name.trim() : null;
    return {
      index,
      id: target?.id ? String(target.id) : null,
      name,
      label: checkpointDisplayLabel(target, index),
    };
  });
}

export function deriveResultStatus(opts: {
  storedStatus: string;
  passedIndexes: Iterable<number>;
  targetCount: number;
  raceOver: boolean;
  committeeAccepted?: boolean;
}): string {
  const storedStatus = String(opts.storedStatus || '');
  if (storedStatus === 'WITHDRAWN') return 'WITHDRAWN';
  if (storedStatus === 'PENDING') return 'PENDING';
  if (storedStatus === 'DSQ') return 'DSQ';
  if (opts.committeeAccepted) return 'FINISHED';

  const passed = passedIndexesToSet(opts.passedIndexes);
  const finished = allCheckpointsPassed(passed, opts.targetCount);
  const started = passed.has(0);

  if (finished) return 'FINISHED';
  if (!started) return opts.raceOver ? 'DNS' : 'NOT_STARTED';
  return opts.raceOver ? 'DNF' : 'RACING';
}

function passedIndexesToSet(indexes: Iterable<number>): Set<number> {
  return indexes instanceof Set ? indexes : new Set(indexes);
}

export function formatCheckpointExportCells(
  pass:
    | {
        source?: string | null;
        passedAt?: Date | string | null;
        elapsedSeconds?: number | null;
      }
    | null
    | undefined,
  crossingRank: string | number | null | undefined,
  formatters: {
    formatPassTime: (value: Date | string) => string;
    formatElapsedClock: (seconds: number | null | undefined) => string;
  },
): [string, string, string] {
  if (!pass) {
    return [CHECKPOINT_NOT_PASSED_LABEL, CHECKPOINT_NOT_PASSED_LABEL, CHECKPOINT_NOT_PASSED_LABEL];
  }
  const committeeUntimed =
    pass.source === CHECKPOINT_PASS_SOURCE_COMMITTEE && pass.elapsedSeconds == null;
  if (committeeUntimed) {
    return [COMMITTEE_PASS_LABEL, COMMITTEE_PASS_LABEL, COMMITTEE_PASS_LABEL];
  }
  return [
    pass.passedAt ? formatters.formatPassTime(pass.passedAt) : CHECKPOINT_NOT_PASSED_LABEL,
    formatters.formatElapsedClock(pass.elapsedSeconds),
    crossingRank != null && crossingRank !== '' ? String(crossingRank) : '-',
  ];
}

export function formatExportStatusLabel(opts: {
  status: string;
  dnfReason?: string | null;
}): string {
  if (opts.status === 'DNF' && opts.dnfReason) return opts.dnfReason;
  return opts.status;
}
