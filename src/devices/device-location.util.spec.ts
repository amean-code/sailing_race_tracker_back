import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_TIMESTAMP_FUTURE_SKEW_MS,
  parseDeviceTimestamp,
} from './device-location.util';

describe('parseDeviceTimestamp', () => {
  const now = Date.parse('2026-09-29T00:00:00.000Z');

  it('uses now when timestamp omitted', () => {
    const result = parseDeviceTimestamp(undefined, now);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.timestampMs, now);
  });

  it('parses valid ISO timestamp', () => {
    const result = parseDeviceTimestamp('2026-09-28T23:59:00.000Z', now);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.timestampMs, Date.parse('2026-09-28T23:59:00.000Z'));
  });

  it('rejects invalid ISO', () => {
    const result = parseDeviceTimestamp('not-a-date', now);
    assert.deepEqual(result, { ok: false, reason: 'invalid_timestamp' });
  });

  it('rejects timestamp more than 5 minutes in the future', () => {
    const far = new Date(now + DEVICE_TIMESTAMP_FUTURE_SKEW_MS + 1).toISOString();
    const result = parseDeviceTimestamp(far, now);
    assert.deepEqual(result, { ok: false, reason: 'timestamp_too_far_in_future' });
  });

  it('allows timestamp within 5 minute future skew', () => {
    const near = new Date(now + DEVICE_TIMESTAMP_FUTURE_SKEW_MS).toISOString();
    const result = parseDeviceTimestamp(near, now);
    assert.equal(result.ok, true);
  });
});
