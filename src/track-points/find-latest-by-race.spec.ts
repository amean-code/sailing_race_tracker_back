import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLatestByBoatMap,
  isNewerTrackPoint,
  selectLatestTrackPointsPerBoat,
  type LatestTrackPointRow,
} from './find-latest-by-race';

type Row = LatestTrackPointRow & { lat?: number; lng?: number };

function pt(
  id: string,
  boatId: string,
  raceId: string | null,
  recordedAt: string,
  lat = 0,
  lng = 0,
): Row {
  return { id, boatId, raceId, recordedAt, lat, lng };
}

describe('selectLatestTrackPointsPerBoat', () => {
  it('Test 1: returns latest for all 5 boats even when a global 500 window would drop some', () => {
    const raceId = 'race-1';
    const points: Row[] = [];

    // Boat A floods the stream with 500 recent points (would fill old LIMIT 500 alone).
    for (let i = 0; i < 500; i++) {
      points.push(
        pt(`a-${i}`, 'boat-a', raceId, new Date(1_700_000_000_000 + i * 1000).toISOString(), 37, 27),
      );
    }
    // Boats B–E have older last points that fall outside a global top-500 window.
    points.push(pt('b-1', 'boat-b', raceId, '2023-01-01T00:00:00.000Z', 37.1, 27.1));
    points.push(pt('c-1', 'boat-c', raceId, '2023-01-01T00:00:01.000Z', 37.2, 27.2));
    points.push(pt('d-1', 'boat-d', raceId, '2023-01-01T00:00:02.000Z', 37.3, 27.3));
    points.push(pt('e-1', 'boat-e', raceId, '2023-01-01T00:00:03.000Z', 37.4, 27.4));

    // Old (buggy) approach: global ORDER BY recorded_at DESC LIMIT 500 → only boat-a.
    const globalWindow = [...points]
      .sort((a, b) => recordedAtMs(b.recordedAt) - recordedAtMs(a.recordedAt))
      .slice(0, 500);
    const buggyMap = new Map<string, Row>();
    for (const row of globalWindow) {
      if (!buggyMap.has(row.boatId)) buggyMap.set(row.boatId, row);
    }
    assert.equal(buggyMap.size, 1);
    assert.ok(buggyMap.has('boat-a'));

    // Fixed approach: per-boat latest.
    const latest = selectLatestTrackPointsPerBoat(points, raceId);
    const map = buildLatestByBoatMap(latest);
    assert.equal(map.size, 5);
    assert.equal(map.get('boat-a')?.id, 'a-499');
    assert.equal(map.get('boat-b')?.id, 'b-1');
    assert.equal(map.get('boat-c')?.id, 'c-1');
    assert.equal(map.get('boat-d')?.id, 'd-1');
    assert.equal(map.get('boat-e')?.id, 'e-1');
  });

  it('Test 2: low-frequency boat stays visible next to a 1 Hz boat', () => {
    const raceId = 'race-2';
    const points: Row[] = [];
    const t0 = Date.parse('2026-09-26T13:00:00.000Z');

    // Boat fast: 1 GPS/sec for 60s
    for (let i = 0; i < 60; i++) {
      points.push(pt(`fast-${i}`, 'boat-fast', raceId, new Date(t0 + i * 1000).toISOString()));
    }
    // Boat slow: 1 GPS / 5s
    for (let i = 0; i < 12; i++) {
      points.push(pt(`slow-${i}`, 'boat-slow', raceId, new Date(t0 + i * 5000).toISOString()));
    }

    const map = buildLatestByBoatMap(selectLatestTrackPointsPerBoat(points, raceId));
    assert.equal(map.size, 2);
    assert.equal(map.get('boat-fast')?.id, 'fast-59');
    assert.equal(map.get('boat-slow')?.id, 'slow-11');
  });

  it('Test 3: late-joining boat with few points still appears', () => {
    const raceId = 'race-3';
    const points: Row[] = [
      pt('early-1', 'boat-early', raceId, '2026-09-26T12:00:00.000Z'),
      pt('early-2', 'boat-early', raceId, '2026-09-26T12:01:00.000Z'),
      pt('late-1', 'boat-late', raceId, '2026-09-26T13:28:00.000Z'),
      pt('late-2', 'boat-late', raceId, '2026-09-26T13:28:47.998Z'),
    ];

    const map = buildLatestByBoatMap(selectLatestTrackPointsPerBoat(points, raceId));
    assert.equal(map.size, 2);
    assert.equal(map.get('boat-late')?.id, 'late-2');
    assert.equal(map.get('boat-early')?.id, 'early-2');
  });

  it('Test 4: boat with no GPS has no map entry; others unaffected', () => {
    const raceId = 'race-4';
    const points: Row[] = [
      pt('a-1', 'boat-a', raceId, '2026-09-26T13:00:00.000Z'),
      pt('b-1', 'boat-b', raceId, '2026-09-26T13:00:01.000Z'),
      // boat-c never sends GPS
    ];

    const map = buildLatestByBoatMap(selectLatestTrackPointsPerBoat(points, raceId));
    assert.equal(map.size, 2);
    assert.equal(map.has('boat-c'), false);
    assert.ok(map.has('boat-a'));
    assert.ok(map.has('boat-b'));
  });

  it('Test 5: only the newest recorded_at is selected for a boat', () => {
    const raceId = 'race-5';
    const points: Row[] = [
      pt('old', 'tempo', raceId, '2026-09-26T13:00:00.000Z', 37.0, 27.0),
      pt('mid', 'tempo', raceId, '2026-09-26T13:10:00.000Z', 37.001, 27.001),
      pt('new', 'tempo', raceId, '2026-09-26T13:28:47.998Z', 37.003, 27.419),
    ];

    const [latest] = selectLatestTrackPointsPerBoat(points, raceId);
    assert.equal(latest.id, 'new');
    assert.equal(latest.lat, 37.003);
  });

  it('Test 6: same recorded_at uses id DESC as tie-breaker', () => {
    const raceId = 'race-6';
    const ts = '2026-09-26T13:28:47.998Z';
    const points: Row[] = [
      pt('aaa-older-id', 'tempo', raceId, ts),
      pt('zzz-newer-id', 'tempo', raceId, ts),
      pt('mmm-mid-id', 'tempo', raceId, ts),
    ];

    const [latest] = selectLatestTrackPointsPerBoat(points, raceId);
    assert.equal(latest.id, 'zzz-newer-id');
    assert.equal(isNewerTrackPoint(points[1], points[0]), true);
  });

  it('Test 7: track points from other races do not mix in', () => {
    const raceA = 'race-a';
    const raceB = 'race-b';
    const points: Row[] = [
      pt('a1', 'boat-1', raceA, '2026-09-26T13:00:00.000Z'),
      pt('a2', 'boat-1', raceA, '2026-09-26T13:01:00.000Z'),
      pt('b1', 'boat-1', raceB, '2026-09-26T14:00:00.000Z'),
      pt('b2', 'boat-2', raceB, '2026-09-26T14:00:01.000Z'),
    ];

    const mapA = buildLatestByBoatMap(selectLatestTrackPointsPerBoat(points, raceA));
    const mapB = buildLatestByBoatMap(selectLatestTrackPointsPerBoat(points, raceB));

    assert.equal(mapA.size, 1);
    assert.equal(mapA.get('boat-1')?.id, 'a2');
    assert.equal(mapA.has('boat-2'), false);

    assert.equal(mapB.size, 2);
    assert.equal(mapB.get('boat-1')?.id, 'b1');
    assert.equal(mapB.get('boat-2')?.id, 'b2');
  });
});

describe('buildLatestByBoatMap', () => {
  it('skips rows without boatId and keeps one entry per boat', () => {
    const map = buildLatestByBoatMap([
      { boatId: 'x', id: '1' },
      { boatId: '', id: '2' },
      { boatId: 'y', id: '3' },
    ]);
    assert.equal(map.size, 2);
    assert.equal(map.get('x')?.id, '1');
    assert.equal(map.get('y')?.id, '3');
  });
});

function recordedAtMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
