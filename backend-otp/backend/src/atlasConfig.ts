import { RouteCoordinate } from './fareRouteService.js';

export const ATLAS_LOCATION: RouteCoordinate & { address: string; city: string } = Object.freeze({
  latitude: 19.0709103,
  longitude: 72.8759417,
  placeId: 'ChIJ45sEySvJ5zsR7VTed_4-MG4',
  address: 'Atlas SkillTech University, Equinox Business Park, Kurla West, Mumbai',
  city: 'Mumbai',
});

export const ATLAS_GEOFENCE_METERS = 2000;
export const ATLAS_ENDPOINT_IDENTITY_METERS = 250;

export const isAtlasEndpoint = (location: RouteCoordinate): boolean => {
  const earthRadiusMeters = 6371000;
  const lat1 = location.latitude * Math.PI / 180;
  const lat2 = ATLAS_LOCATION.latitude * Math.PI / 180;
  const deltaLat = (ATLAS_LOCATION.latitude - location.latitude) * Math.PI / 180;
  const deltaLng = (ATLAS_LOCATION.longitude - location.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= ATLAS_ENDPOINT_IDENTITY_METERS;
};

export const canonicalizeAtlasEndpoint = <T extends RouteCoordinate>(location: T): T | typeof ATLAS_LOCATION =>
  isAtlasEndpoint(location) ? ATLAS_LOCATION : location;
