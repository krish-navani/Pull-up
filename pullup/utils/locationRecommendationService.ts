/**
 * Location Recommendation Service for PullUp
 * Provides dynamic nearby landmark suggestions around current location / map camera
 * with a 5-minute memory TTL cache to protect API performance.
 */

import { LatLng } from './geospatialService';

export interface NearbyPlace {
  placeId: string;
  name: string;
  vicinity: string;
  latitude: number;
  longitude: number;
}

const cacheMap = new Map<string, { timestamp: number; places: NearbyPlace[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches nearby landmark recommendations around a coordinate using Google Places API
 * or fallback calculation.
 */
export async function fetchNearbyRecommendations(
  center: LatLng,
  apiKey?: string
): Promise<NearbyPlace[]> {
  if (!center || !center.latitude || !center.longitude) return [];

  const cacheKey = `${center.latitude.toFixed(3)}_${center.longitude.toFixed(3)}`;
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.places;
  }

  try {
    if (apiKey) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${center.latitude},${center.longitude}&radius=1500&type=point_of_interest&key=${apiKey}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        console.warn(`[RECOMMENDATION SERVICE] Nearby places HTTP ${res.status}`);
        cacheMap.set(cacheKey, { timestamp: Date.now(), places: [] });
        return [];
      }
      const data = await res.json();
      if (data.results && Array.isArray(data.results)) {
        const places: NearbyPlace[] = data.results.slice(0, 6).map((item: any) => ({
          placeId: item.place_id,
          name: item.name,
          vicinity: item.vicinity || item.formatted_address || 'Nearby Landmark',
          latitude: item.geometry.location.lat,
          longitude: item.geometry.location.lng,
        }));
        cacheMap.set(cacheKey, { timestamp: Date.now(), places });
        return places;
      }
    } else {
      console.warn('[RECOMMENDATION SERVICE] Google Maps API key not configured; nearby recommendations disabled');
    }
  } catch (err) {
    console.warn('[RECOMMENDATION SERVICE] Failed to fetch google places nearby:', err);
  }

  cacheMap.set(cacheKey, { timestamp: Date.now(), places: [] });
  return [];
}
