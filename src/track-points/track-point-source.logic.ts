import { TrackPointSourceEnum } from '../common/constants';

/**
 * Pure helpers for phone-vs-device active-source decisions.
 * History is always allowed to persist; these gates only affect
 * PWA suppression and which inserts fan out as live GPS events.
 */

export type DeviceLiveEmitSkipReason = 'ooo_device' | 'stale_device' | 'prefer_phone';

export type DeviceLiveEmitDecision =
  | { emit: true }
  | { emit: false; reason: DeviceLiveEmitSkipReason };

export function shouldSkipPwaForLiveDevice(args: {
  source: TrackPointSourceEnum;
  boatId: string;
  liveDeviceBoats: Set<string>;
  preferPhoneBoats: Set<string>;
}): boolean {
  if (args.source === TrackPointSourceEnum.DEVICE) return false;
  if (args.preferPhoneBoats.has(args.boatId)) return false;
  return args.liveDeviceBoats.has(args.boatId);
}

/** When sailor prefers phone, still persist device rows but do not broadcast them. */
export function shouldEmitLiveGps(args: {
  source: TrackPointSourceEnum;
  boatId: string;
  preferPhoneBoats: Set<string>;
}): boolean {
  if (args.source === TrackPointSourceEnum.DEVICE && args.preferPhoneBoats.has(args.boatId)) {
    return false;
  }
  return true;
}

/**
 * Device-only live-emit gate (OOO + stale + prefer_phone).
 * Callers must not apply this to PWA — PWA keeps shouldEmitLiveGps only.
 * Prefer_phone is checked first so skip reason matches product intent.
 */
export function evaluateDeviceLiveEmit(args: {
  recordedAtMs: number;
  lastEmittedMs: number | null;
  nowMs: number;
  maxAgeMs: number;
  boatId: string;
  preferPhoneBoats: Set<string>;
}): DeviceLiveEmitDecision {
  if (args.preferPhoneBoats.has(args.boatId)) {
    return { emit: false, reason: 'prefer_phone' };
  }
  if (!Number.isFinite(args.recordedAtMs)) {
    return { emit: false, reason: 'stale_device' };
  }
  if (args.nowMs - args.recordedAtMs > args.maxAgeMs) {
    return { emit: false, reason: 'stale_device' };
  }
  if (args.lastEmittedMs != null && args.recordedAtMs < args.lastEmittedMs) {
    return { emit: false, reason: 'ooo_device' };
  }
  return { emit: true };
}

export function refreshPreferPhoneExpiry(
  map: Map<string, number>,
  boatIds: string[],
  nowMs: number,
  ttlMs: number,
): void {
  const expiresAt = nowMs + ttlMs;
  for (const boatId of boatIds) {
    if (!boatId) continue;
    map.set(boatId, expiresAt);
  }
}

export function collectActivePreferPhoneBoats(
  map: Map<string, number>,
  boatIds: string[],
  nowMs: number,
): Set<string> {
  const active = new Set<string>();
  for (const boatId of boatIds) {
    if (!boatId) continue;
    const expiresAt = map.get(boatId);
    if (expiresAt == null) continue;
    if (expiresAt < nowMs) {
      map.delete(boatId);
      continue;
    }
    active.add(boatId);
  }
  return active;
}
