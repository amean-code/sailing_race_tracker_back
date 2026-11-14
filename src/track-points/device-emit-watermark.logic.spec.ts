import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE,
  DEVICE_EMIT_ADVISORY_LOCK_SQL,
} from './device-emit-lock.logic';
import {
  isPgUniqueViolation,
  nextDeviceEmitWatermarkMs,
} from './device-emit-watermark.logic';
import { evaluateDeviceLiveEmit } from './track-point-source.logic';
import { DEVICE_LIVE_EMIT_MAX_AGE_MS } from '../common/constants';

describe('device-emit-watermark.logic', () => {
  it('advances watermark only when emit=true', () => {
    assert.equal(nextDeviceEmitWatermarkMs(100, 200, true), 200);
    assert.equal(nextDeviceEmitWatermarkMs(100, 50, false), 100);
    assert.equal(nextDeviceEmitWatermarkMs(null, 50, false), null);
    assert.equal(nextDeviceEmitWatermarkMs(null, 50, true), 50);
  });

  it('does not move watermark backward on emit of older ts', () => {
    assert.equal(nextDeviceEmitWatermarkMs(200, 100, true), 200);
  });

  it('prefer_phone / stale / ooo leave watermark unchanged via emit=false', () => {
    const now = 1_000_000;
    const prefer = evaluateDeviceLiveEmit({
      recordedAtMs: now,
      lastEmittedMs: now - 10_000,
      nowMs: now,
      maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
      boatId: 'b1',
      preferPhoneBoats: new Set(['b1']),
    });
    assert.equal(prefer.emit, false);
    if (!prefer.emit) {
      assert.equal(
        nextDeviceEmitWatermarkMs(now - 10_000, now, prefer.emit),
        now - 10_000,
      );
    }

    const stale = evaluateDeviceLiveEmit({
      recordedAtMs: now - DEVICE_LIVE_EMIT_MAX_AGE_MS - 1,
      lastEmittedMs: now - 10_000,
      nowMs: now,
      maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
      boatId: 'b1',
      preferPhoneBoats: new Set(),
    });
    assert.deepEqual(stale, { emit: false, reason: 'stale_device' });

    const ooo = evaluateDeviceLiveEmit({
      recordedAtMs: now - 20_000,
      lastEmittedMs: now - 5_000,
      nowMs: now,
      maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
      boatId: 'b1',
      preferPhoneBoats: new Set(),
    });
    assert.deepEqual(ooo, { emit: false, reason: 'ooo_device' });
  });

  it('ordered emit advances watermark like restart-safe DB row', () => {
    let wm: number | null = null;
    const now = 1_000_000;
    for (const ts of [now - 15_000, now - 10_000, now - 5_000]) {
      const d = evaluateDeviceLiveEmit({
        recordedAtMs: ts,
        lastEmittedMs: wm,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'b1',
        preferPhoneBoats: new Set(),
      });
      assert.equal(d.emit, true);
      wm = nextDeviceEmitWatermarkMs(wm, ts, d.emit);
    }
    assert.equal(wm, now - 5_000);

    // After "restart", wm reloaded from DB — OOO still blocked.
    const late = evaluateDeviceLiveEmit({
      recordedAtMs: now - 12_000,
      lastEmittedMs: wm,
      nowMs: now,
      maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
      boatId: 'b1',
      preferPhoneBoats: new Set(),
    });
    assert.deepEqual(late, { emit: false, reason: 'ooo_device' });
    assert.equal(nextDeviceEmitWatermarkMs(wm, now - 12_000, false), wm);
  });

  it('advisory lock SQL uses hashtext + feature namespace', () => {
    assert.match(DEVICE_EMIT_ADVISORY_LOCK_SQL, /pg_advisory_xact_lock/);
    assert.match(DEVICE_EMIT_ADVISORY_LOCK_SQL, /hashtext/);
    assert.equal(DEVICE_EMIT_ADVISORY_LOCK_NAMESPACE, 872_014);
  });

  it('detects Postgres unique_violation for duplicate client_key races', () => {
    assert.equal(isPgUniqueViolation({ code: '23505' }), true);
    assert.equal(isPgUniqueViolation({ driverError: { code: '23505' } }), true);
    assert.equal(isPgUniqueViolation({ code: '23503' }), false);
    assert.equal(isPgUniqueViolation(null), false);
  });

  it('simulates two boats without shared watermark coupling', () => {
    let wmA: number | null = null;
    let wmB: number | null = null;
    const now = 2_000_000;
    wmA = nextDeviceEmitWatermarkMs(wmA, now - 1_000, true);
    wmB = nextDeviceEmitWatermarkMs(wmB, now - 500, true);
    assert.equal(wmA, now - 1_000);
    assert.equal(wmB, now - 500);
  });
});
