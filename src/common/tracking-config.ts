export type TrackingConfig = {
  sampleIntervalMs: number;
  headingThresholdDeg: number;
  minDistanceM: number;
  speedWindowSec: number;
  watchMaximumAgeMs: number;
  watchTimeoutMs: number;
};

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  sampleIntervalMs: 2000,
  headingThresholdDeg: 3,
  minDistanceM: 5,
  speedWindowSec: 3,
  watchMaximumAgeMs: 0,
  watchTimeoutMs: 5000,
};

const LIMITS = {
  sampleIntervalMs: { min: 500, max: 30000 },
  headingThresholdDeg: { min: 1, max: 45 },
  minDistanceM: { min: 1, max: 100 },
  speedWindowSec: { min: 1, max: 30 },
  watchMaximumAgeMs: { min: 0, max: 10000 },
  watchTimeoutMs: { min: 1000, max: 30000 },
} as const;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function resolveTrackingConfig(
  partial?: Partial<TrackingConfig> | Record<string, unknown> | null,
): TrackingConfig {
  const src = partial ?? {};
  return {
    sampleIntervalMs: clampNumber(
      src.sampleIntervalMs,
      LIMITS.sampleIntervalMs.min,
      LIMITS.sampleIntervalMs.max,
      DEFAULT_TRACKING_CONFIG.sampleIntervalMs,
    ),
    headingThresholdDeg: clampNumber(
      src.headingThresholdDeg,
      LIMITS.headingThresholdDeg.min,
      LIMITS.headingThresholdDeg.max,
      DEFAULT_TRACKING_CONFIG.headingThresholdDeg,
    ),
    minDistanceM: clampNumber(
      src.minDistanceM,
      LIMITS.minDistanceM.min,
      LIMITS.minDistanceM.max,
      DEFAULT_TRACKING_CONFIG.minDistanceM,
    ),
    speedWindowSec: clampNumber(
      src.speedWindowSec,
      LIMITS.speedWindowSec.min,
      LIMITS.speedWindowSec.max,
      DEFAULT_TRACKING_CONFIG.speedWindowSec,
    ),
    watchMaximumAgeMs: clampNumber(
      src.watchMaximumAgeMs,
      LIMITS.watchMaximumAgeMs.min,
      LIMITS.watchMaximumAgeMs.max,
      DEFAULT_TRACKING_CONFIG.watchMaximumAgeMs,
    ),
    watchTimeoutMs: clampNumber(
      src.watchTimeoutMs,
      LIMITS.watchTimeoutMs.min,
      LIMITS.watchTimeoutMs.max,
      DEFAULT_TRACKING_CONFIG.watchTimeoutMs,
    ),
  };
}
