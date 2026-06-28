export interface Coordinate {
  latitude: number;
  longitude: number;
}

// Haversine distance in meters
export function getHaversineDistance(c1: Coordinate, c2: Coordinate): number {
  const R = 6371000; // Earth radius in meters
  const lat1Rad = (c1.latitude * Math.PI) / 180;
  const lat2Rad = (c2.latitude * Math.PI) / 180;
  const deltaLat = ((c2.latitude - c1.latitude) * Math.PI) / 180;
  const deltaLng = ((c2.longitude - c1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Distance from point p to line segment ab
export function getDistanceToSegment(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate
): { distance: number; coordinate: Coordinate } {
  const latFactor = 111000;
  const lngFactor = 111000 * Math.cos((a.latitude * Math.PI) / 180);

  const ax = a.longitude * lngFactor;
  const ay = a.latitude * latFactor;
  const bx = b.longitude * lngFactor;
  const by = b.latitude * latFactor;
  const px = p.longitude * lngFactor;
  const py = p.latitude * latFactor;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLen2 = abx * abx + aby * aby;
  let t = 0;
  if (abLen2 > 0) {
    t = (apx * abx + apy * aby) / abLen2;
    t = Math.max(0, Math.min(1, t)); // clamp to line segment
  }

  const nearestLat = a.latitude + t * (b.latitude - a.latitude);
  const nearestLng = a.longitude + t * (b.longitude - a.longitude);
  const nearestCoord = { latitude: nearestLat, longitude: nearestLng };

  return {
    distance: getHaversineDistance(p, nearestCoord),
    coordinate: nearestCoord,
  };
}

// Distance from point p to polyline coordinates list
export function getDistanceToPolyline(
  p: Coordinate,
  points: Coordinate[]
): { distance: number; coordinate: Coordinate; segmentIndex: number } {
  if (points.length === 0) {
    return { distance: Infinity, coordinate: p, segmentIndex: -1 };
  }
  if (points.length === 1) {
    return {
      distance: getHaversineDistance(p, points[0]),
      coordinate: points[0],
      segmentIndex: 0,
    };
  }

  let minDistance = Infinity;
  let nearestCoord = points[0];
  let segmentIndex = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const res = getDistanceToSegment(p, points[i], points[i + 1]);
    if (res.distance < minDistance) {
      minDistance = res.distance;
      nearestCoord = res.coordinate;
      segmentIndex = i;
    }
  }

  return { distance: minDistance, coordinate: nearestCoord, segmentIndex };
}

// Douglas-Peucker simplification algorithm
export function simplifyDouglasPeucker(
  points: Coordinate[],
  toleranceMeters: number
): Coordinate[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const res = getDistanceToSegment(points[i], points[0], points[end]);
    if (res.distance > maxDistance) {
      maxDistance = res.distance;
      index = i;
    }
  }

  if (maxDistance > toleranceMeters) {
    const results1 = simplifyDouglasPeucker(points.slice(0, index + 1), toleranceMeters);
    const results2 = simplifyDouglasPeucker(points.slice(index), toleranceMeters);
    return results1.slice(0, results1.length - 1).concat(results2);
  }

  return [points[0], points[end]];
}
