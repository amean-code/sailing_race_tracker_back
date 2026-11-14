/**
 * Pure watermark advance rules for device live emit.
 * Skip paths (prefer_phone / stale / ooo) must pass emit=false so watermark is unchanged.
 */
export function nextDeviceEmitWatermarkMs(
  previousMs: number | null,
  recordedAtMs: number,
  emit: boolean,
): number | null {
  if (!emit) return previousMs;
  if (!Number.isFinite(recordedAtMs)) return previousMs;
  if (previousMs == null || recordedAtMs >= previousMs) return recordedAtMs;
  return previousMs;
}

export function isPgUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } } | null;
  return e?.code === '23505' || e?.driverError?.code === '23505';
}
