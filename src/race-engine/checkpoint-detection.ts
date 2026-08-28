import * as turf from '@turf/turf';
import { CHECKPOINT_PROXIMITY_TOLERANCE_M } from '../common/constants';

export const CHECKPOINT_PROXIMITY_TOLERANCE_KM = CHECKPOINT_PROXIMITY_TOLERANCE_M / 1000;

/** Buoy CPA thresholds derived from proximity tolerance. */
export const BUOY_CPA_AWARD_KM = CHECKPOINT_PROXIMITY_TOLERANCE_KM;
export const BUOY_CPA_SECONDARY_MAX_KM = CHECKPOINT_PROXIMITY_TOLERANCE_KM * 1.6;
export const BUOY_CPA_CLEARANCE_KM = CHECKPOINT_PROXIMITY_TOLERANCE_KM * 0.4;
export const BUOY_WRONG_SIDE_RESET_KM = CHECKPOINT_PROXIMITY_TOLERANCE_KM * 2;
export const BUOY_INCOMPLETE_RESET_KM = CHECKPOINT_PROXIMITY_TOLERANCE_KM * 2.4;

export type LineCoords = [[number, number], [number, number]];

/** Match frontend raceLine.normalizeLineCrossing: starboard→up, port→down. */
export function normalizeLineCrossing(crossing?: string | null): 'up' | 'down' {
  const value = String(crossing || '').toLowerCase();
  if (value === 'down' || value === 'port') return 'down';
  return 'up';
}

/** Geographic span bearing A→B (degrees). Same basis as frontend getLineBearing. */
export function getLineSpanBearing(coords: LineCoords): number {
  return turf.bearing(
    turf.point([coords[0][1], coords[0][0]]),
    turf.point([coords[1][1], coords[1][0]]),
  );
}

/**
 * Passage direction matching map arrows (getLinePassageBearing):
 * up/starboard = span − 90°, down/port = span + 90°.
 */
export function getRequiredPassageBearing(
  coords: LineCoords,
  crossing?: string | null,
): number {
  const span = getLineSpanBearing(coords);
  const offset = normalizeLineCrossing(crossing) === 'up' ? -90 : 90;
  return span + offset;
}

function bearingDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * After a geometric intersection, accept only if boat motion is within 90° of the
 * designed passage arrows (rejects reverse/iskele-vs-sancak wrong way).
 */
export function isLineCrossedInRequiredDirection(
  coords: LineCoords,
  crossing: string | undefined | null,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): boolean {
  const required = getRequiredPassageBearing(coords, crossing);
  const boatBearing = turf.bearing(
    turf.point([prevLng, prevLat]),
    turf.point([lng, lat]),
  );
  return bearingDiffDeg(boatBearing, required) <= 90;
}

function toTargetLine(coords: LineCoords) {
  return turf.lineString([
    [coords[0][1], coords[0][0]],
    [coords[1][1], coords[1][0]],
  ]);
}

/** Exact geographic point where the boat track intersects the line. */
export function getLineCrossingPoint(
  coords: LineCoords,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): { lat: number; lng: number } | null {
  const boatPath = turf.lineString([[prevLng, prevLat], [lng, lat]]);
  const targetLine = toTargetLine(coords);
  const intersects = turf.lineIntersect(boatPath, targetLine);
  if (intersects.features.length === 0) return null;
  const [crossLng, crossLat] = intersects.features[0].geometry.coordinates;
  return { lat: crossLat, lng: crossLng };
}

/** +1 / -1 for which side of the line segment a point lies on; 0 if on the line. */
export function getSideOfLine(coords: LineCoords, lat: number, lng: number): number {
  const [aLat, aLng] = coords[0];
  const [bLat, bLng] = coords[1];
  const cross = (bLng - aLng) * (lat - aLat) - (bLat - aLat) * (lng - aLng);
  if (Math.abs(cross) < 1e-12) return 0;
  return cross > 0 ? 1 : -1;
}

export function doesSegmentCrossLine(
  coords: LineCoords,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): boolean {
  const sidePrev = getSideOfLine(coords, prevLat, prevLng);
  const sideCurr = getSideOfLine(coords, lat, lng);
  return sidePrev !== 0 && sideCurr !== 0 && sidePrev !== sideCurr;
}

export function getMinSegmentToLineDistanceKm(
  coords: LineCoords,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
): number {
  const targetLine = toTargetLine(coords);
  const prevPt = turf.point([prevLng, prevLat]);
  const currPt = turf.point([lng, lat]);
  const midPt = turf.point([(prevLng + lng) / 2, (prevLat + lat) / 2]);
  const d1 = turf.pointToLineDistance(prevPt, targetLine, { units: 'kilometers' });
  const d2 = turf.pointToLineDistance(currPt, targetLine, { units: 'kilometers' });
  const d3 = turf.pointToLineDistance(midPt, targetLine, { units: 'kilometers' });
  return Math.min(d1, d2, d3);
}

export function getNearestPointOnTargetLine(
  coords: LineCoords,
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const targetLine = toTargetLine(coords);
  const nearest = turf.nearestPointOnLine(targetLine, turf.point([lng, lat]));
  const [crossLng, crossLat] = nearest.geometry.coordinates;
  return { lat: crossLat, lng: crossLng };
}

export interface LineCheckpointResult {
  crossed: boolean;
  crossingPoint: { lat: number; lng: number } | null;
  usedProximityFallback: boolean;
  rejectReason?: 'wrong_direction';
}

/**
 * Detect start/gate/finish crossing: exact line intersect first, then proximity fallback
 * within tolerance when the segment passes near the line but misses geometric intersection.
 */
export function checkLineCheckpointCrossed(
  coords: LineCoords,
  crossing: string | undefined | null,
  prevLng: number,
  prevLat: number,
  lng: number,
  lat: number,
  toleranceKm: number = CHECKPOINT_PROXIMITY_TOLERANCE_KM,
): LineCheckpointResult {
  const boatPath = turf.lineString([[prevLng, prevLat], [lng, lat]]);
  const targetLine = toTargetLine(coords);
  const intersects = turf.lineIntersect(boatPath, targetLine);

  if (intersects.features.length > 0) {
    const crossingPoint = getLineCrossingPoint(coords, prevLng, prevLat, lng, lat);
    const directionOk = isLineCrossedInRequiredDirection(
      coords,
      crossing,
      prevLng,
      prevLat,
      lng,
      lat,
    );
    return {
      crossed: directionOk,
      crossingPoint: directionOk ? crossingPoint : null,
      usedProximityFallback: false,
      rejectReason: directionOk ? undefined : 'wrong_direction',
    };
  }

  const minDist = getMinSegmentToLineDistanceKm(coords, prevLng, prevLat, lng, lat);
  const nearEnough = minDist <= toleranceKm;
  const crossesSides = doesSegmentCrossLine(coords, prevLng, prevLat, lng, lat);
  const directionOk = isLineCrossedInRequiredDirection(
    coords,
    crossing,
    prevLng,
    prevLat,
    lng,
    lat,
  );

  if (nearEnough && crossesSides && directionOk) {
    return {
      crossed: true,
      crossingPoint: getNearestPointOnTargetLine(coords, lat, lng),
      usedProximityFallback: true,
    };
  }

  return { crossed: false, crossingPoint: null, usedProximityFallback: false };
}

export interface BuoyRoundingState {
  minDistance: number;
  closestSide?: 'port' | 'starboard';
}

export interface BuoyCheckpointResult {
  crossed: boolean;
  state: BuoyRoundingState;
  rejectReason?: 'wrong_rounding_side';
}

export function checkBuoyCheckpointCrossed(
  coord: [number, number],
  rounding: string | undefined | null,
  heading: number,
  lat: number,
  lng: number,
  state: BuoyRoundingState,
): BuoyCheckpointResult {
  const tLat = coord[0];
  const tLng = coord[1];
  const boatPt = turf.point([lng, lat]);
  const buoyPt = turf.point([tLng, tLat]);
  const distance = turf.distance(boatPt, buoyPt, { units: 'kilometers' });

  const absoluteBearing = turf.bearing(boatPt, buoyPt);
  let relativeBearing = absoluteBearing - heading;
  while (relativeBearing <= -180) relativeBearing += 360;
  while (relativeBearing > 180) relativeBearing -= 360;

  const roundingRule = rounding ? rounding.toLowerCase() : 'line';
  const nextState: BuoyRoundingState = {
    minDistance: state.minDistance ?? Infinity,
    closestSide: state.closestSide,
  };

  if (distance < nextState.minDistance) {
    nextState.minDistance = distance;
    nextState.closestSide = relativeBearing < 0 ? 'port' : 'starboard';
  }

  let hasRoundedCorrectly = false;
  if (roundingRule === 'port') {
    hasRoundedCorrectly =
      relativeBearing < -90 && nextState.closestSide === 'port';
  } else if (roundingRule === 'starboard') {
    hasRoundedCorrectly =
      relativeBearing > 90 && nextState.closestSide === 'starboard';
  } else {
    hasRoundedCorrectly = Math.abs(relativeBearing) > 90;
  }

  if (nextState.minDistance < BUOY_CPA_AWARD_KM && hasRoundedCorrectly) {
    return {
      crossed: true,
      state: { minDistance: Infinity, closestSide: undefined },
    };
  }

  if (
    distance > nextState.minDistance + BUOY_CPA_CLEARANCE_KM &&
    nextState.minDistance < BUOY_CPA_SECONDARY_MAX_KM
  ) {
    let sideCorrect = true;
    if (roundingRule === 'port') sideCorrect = nextState.closestSide === 'port';
    if (roundingRule === 'starboard') {
      sideCorrect = nextState.closestSide === 'starboard';
    }

    if (sideCorrect && hasRoundedCorrectly) {
      return {
        crossed: true,
        state: { minDistance: Infinity, closestSide: undefined },
      };
    }

    if (!sideCorrect && distance > BUOY_WRONG_SIDE_RESET_KM) {
      return {
        crossed: false,
        state: { minDistance: Infinity, closestSide: undefined },
        rejectReason: 'wrong_rounding_side',
      };
    }

    if (distance > BUOY_INCOMPLETE_RESET_KM) {
      return {
        crossed: false,
        state: { minDistance: Infinity, closestSide: undefined },
      };
    }
  }

  return { crossed: false, state: nextState };
}
