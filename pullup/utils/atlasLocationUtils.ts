/**
 * Atlas Location and Ride Direction Constants
 */

export const ATLAS_LOCATION = {
  latitude: 19.0709103,
  longitude: 72.8759417,
  placeId: 'ChIJ45sEySvJ5zsR7VTed_4-MG4',
  address: 'Atlas SkillTech University, Equinox Business Park, Kurla West, Mumbai',
  city: 'Mumbai',
} as const;

export const ATLAS_RADIUS_KM = 2;

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a location is within Atlas radius
 */
export function isWithinAtlasRadius(latitude: number, longitude: number): boolean {
  const distance = calculateDistance(
    latitude,
    longitude,
    ATLAS_LOCATION.latitude,
    ATLAS_LOCATION.longitude
  );
  return distance <= ATLAS_RADIUS_KM;
}

/**
 * Determine ride direction type
 * - 'home-to-atlas': From home to Atlas
 * - 'atlas-to-home': From Atlas to home or anywhere
 * - 'other': Neither (not allowed in production)
 */
export function canonicalizeAtlasEndpoint<T extends { latitude: number; longitude: number }>(location: T): T | typeof ATLAS_LOCATION {
  return isWithinAtlasRadius(location.latitude, location.longitude) ? ATLAS_LOCATION : location;
}

export function getRideDirectionType(
  pickupLat: number,
  pickupLon: number,
  dropoffLat: number,
  dropoffLon: number
): 'home-to-atlas' | 'atlas-to-home' | 'other' {
  const pickupIsAtlas = isWithinAtlasRadius(pickupLat, pickupLon);
  const dropoffIsAtlas = isWithinAtlasRadius(dropoffLat, dropoffLon);

  if (!pickupIsAtlas && dropoffIsAtlas) {
    return 'home-to-atlas';
  } else if (pickupIsAtlas) {
    return 'atlas-to-home';
  }
  return 'other';
}

/**
 * Validate ride based on direction rules
 * Returns { isValid: boolean, message: string }
 */
export function validateRideDirections(
  pickupLat: number,
  pickupLon: number,
  dropoffLat: number,
  dropoffLon: number
): { isValid: boolean; message: string } {
  const direction = getRideDirectionType(pickupLat, pickupLon, dropoffLat, dropoffLon);

  if (direction === 'home-to-atlas') {
    return {
      isValid: true,
      message: 'Valid: From home to Atlas',
    };
  } else if (direction === 'atlas-to-home') {
    return {
      isValid: true,
      message: 'Valid: From Atlas to home',
    };
  }
  return {
    isValid: false,
    message: 'Rides must be either from home to Atlas, or from Atlas to home/other location',
  };
}
