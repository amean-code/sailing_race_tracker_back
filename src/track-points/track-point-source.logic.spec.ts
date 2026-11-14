import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_LIVE_EMIT_MAX_AGE_MS,
  TrackPointSourceEnum,
} from '../common/constants';
import {
  collectActivePreferPhoneBoats,
  evaluateDeviceLiveEmit,
  refreshPreferPhoneExpiry,
  shouldEmitLiveGps,
  shouldSkipPwaForLiveDevice,
} from './track-point-source.logic';

describe('track-point-source.logic', () => {
  it('skips PWA while device is live unless phone is preferred', () => {
    const live = new Set(['boat-a']);
    const prefer = new Set<string>();
    assert.equal(
      shouldSkipPwaForLiveDevice({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        liveDeviceBoats: live,
        preferPhoneBoats: prefer,
      }),
      true,
    );
    prefer.add('boat-a');
    assert.equal(
      shouldSkipPwaForLiveDevice({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        liveDeviceBoats: live,
        preferPhoneBoats: prefer,
      }),
      false,
    );
  });

  it('never skips device inserts via device_primary gate', () => {
    assert.equal(
      shouldSkipPwaForLiveDevice({
        source: TrackPointSourceEnum.DEVICE,
        boatId: 'boat-a',
        liveDeviceBoats: new Set(['boat-a']),
        preferPhoneBoats: new Set(),
      }),
      false,
    );
  });

  it('suppresses live emit for device while phone is preferred', () => {
    assert.equal(
      shouldEmitLiveGps({
        source: TrackPointSourceEnum.DEVICE,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(['boat-a']),
      }),
      false,
    );
    assert.equal(
      shouldEmitLiveGps({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(['boat-a']),
      }),
      true,
    );
    assert.equal(
      shouldEmitLiveGps({
        source: TrackPointSourceEnum.DEVICE,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      true,
    );
  });

  it('refreshes and expires prefer-phone boat ids', () => {
    const map = new Map<string, number>();
    refreshPreferPhoneExpiry(map, ['boat-a'], 1_000, 500);
    assert.deepEqual([...collectActivePreferPhoneBoats(map, ['boat-a'], 1_200)], ['boat-a']);
    assert.deepEqual([...collectActivePreferPhoneBoats(map, ['boat-a'], 1_600)], []);
    assert.equal(map.has('boat-a'), false);
  });

  it('emits ordered fresh device points', () => {
    const now = 1_000_000;
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now - 5_000,
        lastEmittedMs: now - 10_000,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: true },
    );
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now - 1_000,
        lastEmittedMs: null,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: true },
    );
  });

  it('blocks OOO device emit but leaves PWA helpers unchanged', () => {
    const now = 1_000_000;
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now - 20_000,
        lastEmittedMs: now - 5_000,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: false, reason: 'ooo_device' },
    );
    assert.equal(
      shouldEmitLiveGps({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      true,
    );
  });

  it('blocks stale device emit beyond DEVICE_LIVE_EMIT_MAX_AGE_MS', () => {
    const now = 1_000_000;
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now - DEVICE_LIVE_EMIT_MAX_AGE_MS - 1,
        lastEmittedMs: null,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: false, reason: 'stale_device' },
    );
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now - DEVICE_LIVE_EMIT_MAX_AGE_MS,
        lastEmittedMs: null,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: true },
    );
  });

  it('prefer_phone suppresses device emit without affecting PWA emit helper', () => {
    const now = 1_000_000;
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: now,
        lastEmittedMs: null,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(['boat-a']),
      }),
      { emit: false, reason: 'prefer_phone' },
    );
    assert.equal(
      shouldEmitLiveGps({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(['boat-a']),
      }),
      true,
    );
    assert.equal(
      shouldSkipPwaForLiveDevice({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        liveDeviceBoats: new Set(['boat-a']),
        preferPhoneBoats: new Set(['boat-a']),
      }),
      false,
    );
  });

  it('equal timestamp to last emitted is not OOO', () => {
    const now = 1_000_000;
    const ts = now - 2_000;
    assert.deepEqual(
      evaluateDeviceLiveEmit({
        recordedAtMs: ts,
        lastEmittedMs: ts,
        nowMs: now,
        maxAgeMs: DEVICE_LIVE_EMIT_MAX_AGE_MS,
        boatId: 'boat-a',
        preferPhoneBoats: new Set(),
      }),
      { emit: true },
    );
  });

  it('device-primary still skips PWA when phone is not preferred', () => {
    assert.equal(
      shouldSkipPwaForLiveDevice({
        source: TrackPointSourceEnum.PWA,
        boatId: 'boat-a',
        liveDeviceBoats: new Set(['boat-a']),
        preferPhoneBoats: new Set(),
      }),
      true,
    );
  });
});
