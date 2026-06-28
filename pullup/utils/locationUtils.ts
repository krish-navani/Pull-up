import { Location as LocationType } from '@/types';
import * as Location from 'expo-location';

const LOCATION_FIX_TIMEOUT_MS = 6500;
const REVERSE_GEOCODE_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(fallback);
      });
  });
}

/**
 * Request location permission and return current user location
 */
export async function getReverseGeocodeDetails(
  latitude: number,
  longitude: number
): Promise<{ address: string; city: string; locality: string; state: string }> {
  try {
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return { address: 'Current Location', city: 'Mumbai', locality: '', state: 'Maharashtra' };
    }
    const result = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      REVERSE_GEOCODE_TIMEOUT_MS,
      []
    );
    if (result && result.length > 0) {
      const item = result[0];
      const parts = [
        item.street || item.name || '',
        item.city || item.subregion || item.district || '',
        item.region || '',
      ].filter(Boolean);
      return {
        address: parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        city: item.city || item.subregion || item.district || 'Mumbai',
        locality: item.district || item.name || item.street || '',
        state: item.region || 'Maharashtra',
      };
    }
  } catch (err) {
    console.warn('[LOCATION] Reverse geocode details failed:', err);
  }
  return { address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, city: 'Mumbai', locality: '', state: 'Maharashtra' };
}

/**
 * Request location permission and return current user location
 */
export async function getCurrentLocation(): Promise<LocationType | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[LOCATION] Location permission not granted');
      return null;
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60 * 1000,
      requiredAccuracy: 2000,
    });

    const location = lastKnown || await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      }),
      LOCATION_FIX_TIMEOUT_MS,
      null
    );

    if (!location || !location.coords) {
      console.warn('[LOCATION] No location data received');
      return null;
    }

    const { latitude, longitude } = location.coords;

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      console.warn('[LOCATION] Invalid coordinates from getCurrentPositionAsync:', { latitude, longitude });
      return null;
    }

    const details = await getReverseGeocodeDetails(latitude, longitude);

    return {
      latitude,
      longitude,
      address: details.address,
      city: details.city,
      locality: details.locality,
      state: details.state,
    };
  } catch (error) {
    console.error('[LOCATION] Error getting current location:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates in kilometers
 * Uses Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get address from coordinates using reverse geocoding
 */
export async function getReverseGeocodeAddress(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      console.warn('[LOCATION] Invalid coordinates for reverse geocoding:', { latitude, longitude });
      return `${latitude?.toFixed(4) || 'N/A'}, ${longitude?.toFixed(4) || 'N/A'}`;
    }

    const result = await withTimeout(
      Location.reverseGeocodeAsync({
        latitude,
        longitude,
      }),
      REVERSE_GEOCODE_TIMEOUT_MS,
      []
    );

    if (result && result.length > 0) {
      const address = result[0];
      // Format: "Street, City, State"
      const parts = [
        address.street || address.name || '',
        address.city || '',
        address.region || '',
      ].filter(Boolean);
      return parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  } catch (error) {
    console.error('[LOCATION] Error in reverse geocoding:', error);
    try {
      return `${latitude?.toFixed(4) || 'N/A'}, ${longitude?.toFixed(4) || 'N/A'}`;
    } catch (e) {
      return 'Location Unknown';
    }
  }
}

/**
 * Get coordinates from address using forward geocoding
 */
export async function forwardGeocodeAddress(address: string): Promise<LocationType | null> {
  try {
    if (!address || !address.trim()) {
      console.warn('[LOCATION] Empty address for forward geocoding');
      return null;
    }

    const results = await Location.geocodeAsync(address);

    if (results && results.length > 0) {
      const location = results[0];

      if (
        !location.latitude ||
        !location.longitude ||
        isNaN(location.latitude) ||
        isNaN(location.longitude)
      ) {
        console.warn('[LOCATION] Invalid coordinates from forward geocoding:', location);
        return null;
      }

      const reverseAddress = await getReverseGeocodeAddress(location.latitude, location.longitude);

      return {
        latitude: location.latitude,
        longitude: location.longitude,
        address: reverseAddress,
        city: 'Mumbai', // Default city
      };
    }

    console.log('[LOCATION] No results from forward geocoding for:', address);
    return null;
  } catch (error) {
    console.error('[LOCATION] Error in forward geocoding:', error);
    return null;
  }
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Location suggestion with coordinates
 */
export interface LocationSuggestion {
  displayName: string;
  latitude: number;
  longitude: number;
  mainText?: string;
  secondaryText?: string;
  placeId?: string;
}

// Mumbai center for location bias
const MUMBAI_CENTER = { lat: 19.0760, lng: 72.8777 };

// Mumbai metropolitan area bounds for post-filtering
const MUMBAI_BOUNDS = {
  south: 18.85,
  west: 72.75,
  north: 19.35,
  east: 73.10,
};

/**
 * Get location suggestions using Google Places API (New).
 *
 * Uses the new `places.googleapis.com/v1/places:autocomplete` endpoint
 * (POST with JSON body) which is the current production API from Google.
 * The legacy `maps.googleapis.com/maps/api/place/autocomplete/json` endpoint
 * is deprecated and returns REQUEST_DENIED for new projects.
 *
 * Key features:
 * - Returns exact place matches (e.g., "Oberoi Mall" → Oberoi Mall, Goregaon)
 * - `locationBias` circle centered on Mumbai for relevant results
 * - `includedRegionCodes: ["in"]` restricts to India
 * - Post-filters results to Mumbai metropolitan area bounds
 * - Uses `structuredFormat` for clean main/secondary text display
 * - Returns empty array if no results (no fake fallbacks)
 */
export async function getLocationSuggestionsWithCoords(query: string): Promise<LocationSuggestion[]> {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    if (!apiKey) {
      console.warn('[LOCATION] Google Maps API key not configured');
      return [];
    }

    console.log(`[LOCATION] Searching for: "${query}"`);

    // Step 1: Get autocomplete predictions from Places API (New)
    const predictions = await fetchAutocompletePredictions(query, apiKey);

    if (!predictions || predictions.length === 0) {
      console.log(`[LOCATION] No predictions found for: "${query}"`);
      return [];
    }

    console.log(`[LOCATION] Got ${predictions.length} predictions, resolving coordinates...`);

    // Step 2: Resolve coordinates for each prediction via Place Details (New)
    const results = await Promise.all(
      predictions.map((prediction: any) => resolveCoordinates(prediction, apiKey))
    );

    // Step 3: Filter out failed resolutions
    const validResults = results.filter((r): r is LocationSuggestion => {
      if (!r) return false;
      if (!r.latitude || !r.longitude || isNaN(r.latitude) || isNaN(r.longitude)) return false;
      // Allow all locations globally, matching production apps like Uber/Ola
      return true;
    });

    console.log(`[LOCATION] ✅ Returning ${validResults.length} valid results for "${query}"`);
    return validResults;
  } catch (error) {
    console.error('[LOCATION] Error in getLocationSuggestionsWithCoords:', error);
    return [];
  }
}

/**
 * Fetch autocomplete predictions from the new Places API.
 *
 * Endpoint: POST https://places.googleapis.com/v1/places:autocomplete
 * Auth: X-Goog-Api-Key header
 * Response fields: X-Goog-FieldMask header
 */
async function fetchAutocompletePredictions(query: string, apiKey: string): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const requestBody = {
      input: query,
      includedRegionCodes: ['in'],
      languageCode: 'en',
      locationBias: {
        circle: {
          center: {
            latitude: MUMBAI_CENTER.lat,
            longitude: MUMBAI_CENTER.lng,
          },
          radius: 50000.0, // Google API max limit is 50km
        },
      },
    };

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[LOCATION] Autocomplete HTTP ${response.status}: ${errorText}`);
      return [];
    }

    const data = await response.json();

    if (!data.suggestions || !Array.isArray(data.suggestions)) {
      console.log('[LOCATION] No suggestions in response');
      return [];
    }

    // Extract placePrediction objects (skip queryPredictions)
    const placePredictions = data.suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => s.placePrediction)
      .slice(0, 5); // Limit to 5 for performance

    return placePredictions;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[LOCATION] Autocomplete request timed out');
    } else {
      console.error('[LOCATION] Autocomplete fetch error:', error);
    }
    return [];
  }
}

/**
 * Resolve a single prediction's coordinates via Place Details (New).
 *
 * Endpoint: GET https://places.googleapis.com/v1/places/{placeId}
 * Only requests `location`, `displayName`, and `formattedAddress` fields
 * to minimize billing costs (Essentials SKU for location, Pro for displayName).
 */
async function resolveCoordinates(
  prediction: any,
  apiKey: string
): Promise<LocationSuggestion | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const placeId = prediction.placeId;
    if (!placeId) {
      console.warn('[LOCATION] Prediction missing placeId');
      return null;
    }

    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'location,displayName,formattedAddress',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[LOCATION] Place Details HTTP ${response.status} for ${placeId}`);
      return null;
    }

    const details = await response.json();

    if (!details.location?.latitude || !details.location?.longitude) {
      console.warn(`[LOCATION] No coordinates for place ${placeId}`);
      return null;
    }

    // Use structuredFormat from autocomplete for best display
    const mainText =
      prediction.structuredFormat?.mainText?.text ||
      details.displayName?.text ||
      prediction.text?.text?.split(',')[0] ||
      '';

    const secondaryText =
      prediction.structuredFormat?.secondaryText?.text ||
      details.formattedAddress?.replace(mainText + ', ', '') ||
      '';

    const displayName = prediction.text?.text || details.formattedAddress || mainText;

    return {
      displayName,
      mainText,
      secondaryText,
      latitude: details.location.latitude,
      longitude: details.location.longitude,
      placeId,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`[LOCATION] Place Details timed out for ${prediction.placeId}`);
    } else {
      console.warn(`[LOCATION] Place Details error for ${prediction.placeId}:`, error);
    }
    return null;
  }
}

/**
 * Check if coordinates fall within the Mumbai metropolitan area bounds.
 */
function isWithinMumbaiBounds(lat: number, lng: number): boolean {
  return (
    lat >= MUMBAI_BOUNDS.south &&
    lat <= MUMBAI_BOUNDS.north &&
    lng >= MUMBAI_BOUNDS.west &&
    lng <= MUMBAI_BOUNDS.east
  );
}

/**
 * Get location suggestions based on query using real geocoding
 * Returns formatted address suggestions from expo-location
 */
export async function getLocationSuggestions(query: string): Promise<string[]> {
  try {
    if (!query.trim()) {
      return [];
    }

    // Use forward geocoding to search for locations matching the query
    const results = await Location.geocodeAsync(query);

    if (results.length > 0) {
      // Return all results with better formatting - never show coordinates
      const suggestions = results.map((result: any) => {
        // Format: prefer street/landmark, then city, then region
        const mainLocation = result.street || result.name || result.city || '';
        const secondaryLocation = result.city && result.city !== mainLocation ? result.city : '';
        const region = result.region && result.region !== secondaryLocation ? result.region : '';

        const parts = [mainLocation, secondaryLocation, region].filter(Boolean);
        return parts.join(', ') || mainLocation || result.city || '';
      });
      return suggestions;
    }

    return [];
  } catch (error) {
    console.error('[LOCATION] Error in getLocationSuggestions:', error);
    return [];
  }
}
