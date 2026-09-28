/** Max allowed clock skew for device GPS timestamps (ms). */
export const DEVICE_TIMESTAMP_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type ParsedDeviceTimestamp =
  | { ok: true; timestampMs: number }
  | { ok: false; reason: string };

/**
 * Parse optional ISO timestamp for IoT ingest.
 * Missing → now. Invalid → error. More than 5 min in the future → error.
 */
export function parseDeviceTimestamp(
  iso?: string | null,
  nowMs: number = Date.now(),
): ParsedDeviceTimestamp {
  if (iso == null || iso === '') {
    return { ok: true, timestampMs: nowMs };
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (ms > nowMs + DEVICE_TIMESTAMP_FUTURE_SKEW_MS) {
    return { ok: false, reason: 'timestamp_too_far_in_future' };
  }
  return { ok: true, timestampMs: ms };
}
