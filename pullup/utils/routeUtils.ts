import type { Location } from '@/types';

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

// Fetch route from Google Directions API
export const fetchRoute = async (
  pickup: { latitude: number; longitude: number; address?: string; city?: string },
  dropoff: { latitude: number; longitude: number; address?: string; city?: string },
  apiKey: string,
  waypoints?: Array<{ latitude: number; longitude: number }>
) => {
  try {
    const origin = `${pickup.latitude},${pickup.longitude}`;
    const destination = `${dropoff.latitude},${dropoff.longitude}`;
    
    // Use Directions API
    let directionsURL = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(
      destination
    )}&mode=driving&alternatives=false&key=${apiKey}`;

    if (waypoints && waypoints.length > 0) {
      const waypointsStr = 'optimize:true|' + waypoints.map(wp => `${wp.latitude},${wp.longitude}`).join('|');
      directionsURL += `&waypoints=${encodeURIComponent(waypointsStr)}`;
    }

    console.log('🗺️ Fetching route:', { origin, destination, waypointsCount: waypoints?.length || 0 });

    const response = await fetch(directionsURL);
    const data = await response.json();

    console.log('📱 API Response Status:', data.status);

    if (data.status === 'OK' && data.routes?.length > 0) {
      const route = data.routes[0];
      const points = decodePolyline(route.overview_polyline.points);
      
      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;
      if (route.legs && route.legs.length > 0) {
        route.legs.forEach((leg: any) => {
          totalDistanceMeters += leg.distance?.value || 0;
          totalDurationSeconds += leg.duration?.value || 0;
        });
      }

      const distanceText = totalDistanceMeters > 0 
        ? `${(totalDistanceMeters / 1000).toFixed(1)} km` 
        : route.legs?.[0]?.distance?.text;
      
      const durationText = totalDurationSeconds > 0 
        ? `${Math.round(totalDurationSeconds / 60)} mins` 
        : route.legs?.[0]?.duration?.text;

      console.log('✅ Route decoded successfully:', {
        points: points.length,
        distance: distanceText,
        duration: durationText,
        waypointOrder: route.waypoint_order || [],
      });

      return {
        success: true,
        points,
        polyline: route.overview_polyline.points,
        distance: distanceText,
        duration: durationText,
        distanceMeters: totalDistanceMeters,
        durationSeconds: totalDurationSeconds,
        waypointOrder: route.waypoint_order || [],
      };
    } else {
      console.warn('⚠️ Directions API Warning:', {
        status: data.status,
        error: data.error_message,
      });

      // Fallback to straight line
      return {
        success: false,
        points: [
          { latitude: pickup.latitude, longitude: pickup.longitude },
          { latitude: dropoff.latitude, longitude: dropoff.longitude },
        ],
        error: data.error_message || data.status,
      };
    }
  } catch (error) {
    console.error('❌ Error fetching route:', error);
    
    // Fallback to straight line
    return {
      success: false,
      points: [
        { latitude: pickup.latitude, longitude: pickup.longitude },
        { latitude: dropoff.latitude, longitude: dropoff.longitude },
      ],
      error: 'Network error',
    };
  }
};
