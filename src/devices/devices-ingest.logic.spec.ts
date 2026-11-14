/**
 * Pure logic covering IoT ingest gates that wrap TrackPointsService
 * (no Nest DI / DB — mirrors DevicesService.ingestLocation preconditions).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceStatusEnum } from '../common/constants';

type DeviceLike = {
  status: string;
  assignedBoatId: string | null;
};

type BoatLike = {
  id: string;
  raceId: string | null;
  courseId: string | null;
};

function resolveIngestContext(device: DeviceLike, boat: BoatLike | null) {
  if (device.status !== DeviceStatusEnum.ACTIVE) {
    return { ok: false as const, code: 'disabled' };
  }
  if (!device.assignedBoatId) {
    return { ok: false as const, code: 'unassigned' };
  }
  if (!boat) {
    return { ok: false as const, code: 'boat_missing' };
  }
  if (!boat.raceId) {
    return { ok: false as const, code: 'no_race' };
  }
  return {
    ok: true as const,
    boatId: boat.id,
    raceId: boat.raceId,
    courseId: boat.courseId,
  };
}

function mapLocationToTrackPointInput(
  boatId: string,
  raceId: string,
  courseId: string | null,
  deviceId: string,
  dto: {
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    timestampMs: number;
  },
) {
  return {
    boatId,
    raceId,
    courseId,
    lat: dto.latitude,
    lng: dto.longitude,
    speed: dto.speed ?? null,
    heading: dto.heading ?? null,
    accuracy: dto.accuracy ?? null,
    timestamp: dto.timestampMs,
    source: 'device' as const,
    clientKey: `device:${deviceId}:${dto.timestampMs}`,
  };
}

function validateLocationRanges(dto: {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
}) {
  if (dto.latitude < -90 || dto.latitude > 90) return 'invalid_latitude';
  if (dto.longitude < -180 || dto.longitude > 180) return 'invalid_longitude';
  if (dto.speed != null && dto.speed < 0) return 'invalid_speed';
  if (dto.heading != null && (dto.heading < 0 || dto.heading >= 360)) return 'invalid_heading';
  return null;
}

/** Heartbeat (lastSeen/lastLat) only after a track point was inserted or skipped. */
function shouldUpdateDeviceHeartbeat(sync: {
  inserted: number;
  skipped: number;
  failed: number;
}) {
  return sync.inserted + sync.skipped > 0;
}

function resolveCourseIdForIngest(
  boatCourseId: string | null,
  raceCourseId: string | null | undefined,
) {
  return boatCourseId ?? raceCourseId ?? null;
}

describe('IoT ingest resolve / map / validate', () => {
  it('valid device → correct boat and race resolved', () => {
    const ctx = resolveIngestContext(
      { status: DeviceStatusEnum.ACTIVE, assignedBoatId: 'boat-1' },
      { id: 'boat-1', raceId: 'race-9', courseId: 'course-2' },
    );
    assert.deepEqual(ctx, {
      ok: true,
      boatId: 'boat-1',
      raceId: 'race-9',
      courseId: 'course-2',
    });
  });

  it('disabled device → rejected', () => {
    const ctx = resolveIngestContext(
      { status: DeviceStatusEnum.DISABLED, assignedBoatId: 'boat-1' },
      { id: 'boat-1', raceId: 'race-9', courseId: null },
    );
    assert.deepEqual(ctx, { ok: false, code: 'disabled' });
  });

  it('unassigned device → rejected', () => {
    const ctx = resolveIngestContext(
      { status: DeviceStatusEnum.ACTIVE, assignedBoatId: null },
      null,
    );
    assert.deepEqual(ctx, { ok: false, code: 'unassigned' });
  });

  it('boat without race → resolve reports no_race (service still accepts heartbeat-only)', () => {
    const ctx = resolveIngestContext(
      { status: DeviceStatusEnum.ACTIVE, assignedBoatId: 'boat-1' },
      { id: 'boat-1', raceId: null, courseId: null },
    );
    assert.deepEqual(ctx, { ok: false, code: 'no_race' });
  });

  it('maps latitude/longitude to lat/lng for TrackPointsService', () => {
    const point = mapLocationToTrackPointInput('b1', 'r1', 'c1', 'dev-9', {
      latitude: 37.1,
      longitude: 27.2,
      speed: 3,
      heading: 90,
      accuracy: 5,
      timestampMs: 1_700_000_000_000,
    });
    assert.equal(point.lat, 37.1);
    assert.equal(point.lng, 27.2);
    assert.equal(point.boatId, 'b1');
    assert.equal(point.raceId, 'r1');
    assert.equal(point.timestamp, 1_700_000_000_000);
    // HDOP must never be auto-mapped; only explicit accuracy metres.
    assert.equal(point.accuracy, 5);
    assert.equal(point.source, 'device');
    assert.equal(point.clientKey, 'device:dev-9:1700000000000');
  });

  it('rejects invalid latitude / longitude / speed / heading', () => {
    assert.equal(validateLocationRanges({ latitude: 91, longitude: 0 }), 'invalid_latitude');
    assert.equal(validateLocationRanges({ latitude: 0, longitude: -181 }), 'invalid_longitude');
    assert.equal(validateLocationRanges({ latitude: 0, longitude: 0, speed: -1 }), 'invalid_speed');
    assert.equal(
      validateLocationRanges({ latitude: 0, longitude: 0, heading: 360 }),
      'invalid_heading',
    );
    assert.equal(validateLocationRanges({ latitude: 37, longitude: 27, heading: 0 }), null);
  });

  it('device clientKey uses device:{deviceId}:{timestampMs}', () => {
    const deviceId = 'device-abc';
    const timestampMs = 1_700_000_123_456;
    const clientKey = `device:${deviceId}:${timestampMs}`;
    assert.equal(clientKey, 'device:device-abc:1700000123456');
  });

  it('updates heartbeat only when track point insert or skip succeeded', () => {
    assert.equal(shouldUpdateDeviceHeartbeat({ inserted: 1, skipped: 0, failed: 0 }), true);
    assert.equal(shouldUpdateDeviceHeartbeat({ inserted: 0, skipped: 1, failed: 0 }), true);
    assert.equal(shouldUpdateDeviceHeartbeat({ inserted: 0, skipped: 0, failed: 1 }), false);
  });

  it('falls back to race.courseId when boat.courseId is null', () => {
    assert.equal(resolveCourseIdForIngest(null, 'course-9'), 'course-9');
    assert.equal(resolveCourseIdForIngest('course-1', 'course-9'), 'course-1');
    assert.equal(resolveCourseIdForIngest(null, null), null);
  });
});
