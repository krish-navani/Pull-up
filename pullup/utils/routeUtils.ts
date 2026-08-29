import type { Location } from '@/types';
import apiClient from './backendApiClient';

// Decode polyline from Google Directions API
export const decodePolyline = (encoded: string) => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
};

// Fetch an authoritative road route through the authenticated backend Routes API.
export const fetchRoute = async (
  pickup: { latitude: number; longitude: number; address?: string; city?: string },
  dropoff: { latitude: number; longitude: number; address?: string; city?: string },
  waypoints?: Array<{ latitude: number; longitude: number }>
) => {
  console.log('🗺️ Fetching route:', {
    origin: `${pickup.latitude},${pickup.longitude}`,
    destination: `${dropoff.latitude},${dropoff.longitude}`,
    waypointsCount: waypoints?.length || 0,
  });

  try {
    const response = await apiClient.post('/fare/route-preview', {
      origin: pickup,
      destination: dropoff,
      waypoints: waypoints || [],
    });
    const route = response.data?.route;
    if (!response.data?.success || !route?.encodedPolyline) {
      throw new Error('Route provider returned no polyline.');
    }

    const points = decodePolyline(route.encodedPolyline);
    if (points.length < 2) throw new Error('Route provider returned an invalid polyline.');

    const distanceMeters = Number(route.distanceMeters || 0);
    const durationSeconds = Number(route.durationSeconds || 0);
    if (distanceMeters <= 0 || durationSeconds <= 0) {
      throw new Error('Route provider returned invalid distance or duration.');
    }

    const distance = response.data?.display?.distance || `${(distanceMeters / 1000).toFixed(1)} km`;
    const duration = response.data?.display?.duration || `${Math.max(1, Math.round(durationSeconds / 60))} mins`;
    console.log('✅ Route decoded successfully:', {
      points: points.length,
      distance,
      duration,
      waypointOrder: route.waypointOrder || [],
    });

    return {
      success: true,
      points,
      polyline: route.encodedPolyline,
      distance,
      duration,
      distanceMeters,
      durationSeconds,
      waypointOrder: route.waypointOrder || [],
    };
  } catch (error: any) {
    console.error('❌ Error fetching route:', error?.message || error);
    return {
      success: false,
      points: [],
      error: error?.message || 'Road route request failed',
    };
  }
};