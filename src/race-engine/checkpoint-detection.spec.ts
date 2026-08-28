import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {
  BUOY_CPA_AWARD_KM,
  CHECKPOINT_PROXIMITY_TOLERANCE_KM,
  checkBuoyCheckpointCrossed,
  checkLineCheckpointCrossed,
  doesSegmentCrossLine,
  getMinSegmentToLineDistanceKm,
} from './checkpoint-detection';

/** East-west start line ~110 m at fixed latitude. */
const START_LINE: [[number, number], [number, number]] = [
  [41.0, 29.0],
  [41.0, 29.001],
];

function pointAt(lat: number, lng: number) {
  return { lat, lng };
}

describe('checkLineCheckpointCrossed', () => {
  it('detects exact line intersection with correct crossing direction', () => {
    const south = pointAt(40.99995, 29.0005);
    const north = pointAt(41.00005, 29.0005);

    const result = checkLineCheckpointCrossed(
      START_LINE,
      'up',
      south.lng,
      south.lat,
      north.lng,
      north.lat,
    );

    assert.equal(result.crossed, true);
    assert.equal(result.usedProximityFallback, false);
    assert.ok(result.crossingPoint);
  });

  it('uses proximity fallback when line is offset ~4 m but segment crosses nearby', () => {
    // Short line segment: boat crosses the line plane nearby but misses exact segment intersection.
    const shifted: [[number, number], [number, number]] = [
      [41.0, 29.00048],
      [41.0, 29.00052],
    ];
    const south = pointAt(40.99995, 29.00055);
    const north = pointAt(41.00005, 29.00055);

    const exact = checkLineCheckpointCrossed(
      shifted,
      'up',
      south.lng,
      south.lat,
      north.lng,
      north.lat,
    );
    assert.equal(exact.crossed, true);
    assert.equal(exact.usedProximityFallback, true);

    const minDist = getMinSegmentToLineDistanceKm(
      shifted,
      south.lng,
      south.lat,
      north.lng,
      north.lat,
    );
    assert.ok(minDist <= CHECKPOINT_PROXIMITY_TOLERANCE_KM);
    assert.equal(doesSegmentCrossLine(shifted, south.lng, south.lat, north.lng, north.lat), true);
  });

  it('rejects wrong crossing direction', () => {
    const south = pointAt(40.99995, 29.0005);
    const north = pointAt(41.00005, 29.0005);

    const result = checkLineCheckpointCrossed(
      START_LINE,
      'up',
      north.lng,
      north.lat,
      south.lng,
      south.lat,
    );

    assert.equal(result.crossed, false);
    assert.equal(result.rejectReason, 'wrong_direction');
  });

  it('rejects parallel pass within tolerance without side change', () => {
    const northParallel = turf.destination(
      turf.point([29.0005, START_LINE[0][0]]),
      4 / 1000,
      0,
      { units: 'kilometers' },
    );
    const [lng, lat] = northParallel.geometry.coordinates;

    const prev = pointAt(lat, 29.0002);
    const curr = pointAt(lat, 29.0008);

    const minDist = getMinSegmentToLineDistanceKm(
      START_LINE,
      prev.lng,
      prev.lat,
      curr.lng,
      curr.lat,
    );
    assert.ok(minDist <= CHECKPOINT_PROXIMITY_TOLERANCE_KM);
    assert.equal(
      doesSegmentCrossLine(START_LINE, prev.lng, prev.lat, curr.lng, curr.lat),
      false,
    );

    const result = checkLineCheckpointCrossed(
      START_LINE,
      'up',
      prev.lng,
      prev.lat,
      curr.lng,
      curr.lat,
    );
    assert.equal(result.crossed, false);
  });
});

describe('checkBuoyCheckpointCrossed', () => {
  const buoyCoord: [number, number] = [41.0, 29.0];

  it('awards pass within 5 m with correct port rounding', () => {
    const north = turf.destination(
      turf.point([buoyCoord[1], buoyCoord[0]]),
      4 / 1000,
      0,
      { units: 'kilometers' },
    );
    const [lng, lat] = north.geometry.coordinates;
    const result = checkBuoyCheckpointCrossed(
      buoyCoord,
      'port',
      280,
      lat,
      lng,
      { minDistance: Infinity },
    );
    assert.equal(result.crossed, true);
    assert.equal(result.state.minDistance, Infinity);
  });

  it('does not award pass within 5 m on wrong rounding side', () => {
    const south = turf.destination(
      turf.point([buoyCoord[1], buoyCoord[0]]),
      4 / 1000,
      180,
      { units: 'kilometers' },
    );
    const [lng, lat] = south.geometry.coordinates;
    const result = checkBuoyCheckpointCrossed(
      buoyCoord,
      'port',
      280,
      lat,
      lng,
      { minDistance: Infinity },
    );
    assert.equal(result.crossed, false);
  });

  it('uses 5 m CPA award threshold constant', () => {
    assert.equal(BUOY_CPA_AWARD_KM, 0.005);
  });
});
