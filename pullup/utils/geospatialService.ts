/**
 * Centralized Shared Geospatial Utility for PullUp
 * Provides single-authoritative formulas for distance, polyline corridor projection,
 * geofencing, and proximity scoring across the application.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Calculates straight-line distance in meters between two coordinates using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return calculateHaversineDistance(lat1, lon1, lat2, lon2) / 1000;
}

/**
 * Checks if two coordinates are within a specified distance threshold (default 50 meters).
 */
export function areCoordinatesEqual(
  coord1?: LatLng | null,
  coord2?: LatLng | null,
  thresholdMeters: number = 50
): boolean {
  if (!coord1 || !coord2) return false;
  const dist = calculateHaversineDistance(
    coord1.latitude,
    coord1.longitude,
    coord2.latitude,
    coord2.longitude
  );
  return dist <= thresholdMeters;
}

/**
 * Checks if a coordinate is within a geofence radius.
 */
export function isWithinGeofence(
  currentLocation?: LatLng | null,
  targetLocation?: LatLng | null,
  radiusMeters: number = 2000
): boolean {
  if (!currentLocation || !targetLocation) return false;
  const dist = calculateHaversineDistance(
    currentLocation.latitude,
    currentLocation.longitude,
    targetLocation.latitude,
    targetLocation.longitude
  );
  return dist <= radiusMeters;
}

/**
 * Projects a point onto a line segment between p1 and p2 and returns the closest coordinate and distance.
 */
export function projectPointToSegment(
  p: LatLng,
  p1: LatLng,
  p2: LatLng
): { coordinate: LatLng; distance: number } {
  const x = p.longitude;
  const y = p.latitude;
  const x1 = p1.longitude;
  const y1 = p1.latitude;
  const x2 = p2.longitude;
  const y2 = p2.latitude;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let projX: number;
  let projY: number;

  if (param < 0) {
    projX = x1;
    projY = y1;
  } else if (param > 1) {
    projX = x2;
    projY = y2;
  } else {
    projX = x1 + param * C;
    projY = y1 + param * D;
  }

  const projCoord: LatLng = { latitude: projY, longitude: projX };
  const dist = calculateHaversineDistance(p.latitude, p.longitude, projY, projX);

  return { coordinate: projCoord, distance: dist };
}

/**
 * Calculates the shortest distance in meters from a point to a route polyline.
 */
export function getDistanceToPolyline(
  point: LatLng,
  polylinePoints: LatLng[]
): { distance: number; coordinate: LatLng } {
  if (!polylinePoints || polylinePoints.length === 0) {
    return { distance: Infinity, coordinate: point };
  }

  if (polylinePoints.length === 1) {
    const dist = calculateHaversineDistance(
      point.latitude,
      point.longitude,
      polylinePoints[0].latitude,
      polylinePoints[0].longitude
    );
    return { distance: dist, coordinate: polylinePoints[0] };
  }

  let minDistance = Infinity;
  let closestCoordinate = polylinePoints[0];

  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const res = projectPointToSegment(point, polylinePoints[i], polylinePoints[i + 1]);
    if (res.distance < minDistance) {
      minDistance = res.distance;
      closestCoordinate = res.coordinate;
    }
  }

  return { distance: minDistance, coordinate: closestCoordinate };
}
