import admin from 'firebase-admin';
import crypto from 'node:crypto';

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
  placeId?: string;
  address?: string;
}

export interface AuthoritativeRoute {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  provider: 'google';
  calculatedAt: string;
  cacheHit: boolean;
}

const assertCoordinate = (value: RouteCoordinate, field: string): void => {
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) {
    throw new Error(`MISSING_${field.toUpperCase()}_COORDINATES`);
  }
  if (Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) {
    throw new Error(`INVALID_${field.toUpperCase()}_COORDINATES`);
  }
};

const coordinateParam = (coordinate: RouteCoordinate): string =>
  `${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;

export const geocodeAddress = async (address: string): Promise<RouteCoordinate & { address: string }> => {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) throw new Error('MISSING_LOCATION_ADDRESS');
  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ROUTE_PROVIDER_NOT_CONFIGURED');

  const params = new URLSearchParams({ address: normalizedAddress, key: apiKey });
  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    console.error('[FARE_GEOCODE] Google request failed', { address: normalizedAddress, error });
    throw new Error('ROUTE_PROVIDER_UNAVAILABLE');
  }
  const data: any = await response.json().catch(() => null);
  console.log('[FARE_GEOCODE] provider response', {
    address: normalizedAddress,
    httpStatus: response.status,
    providerStatus: data?.status,
    errorMessage: data?.error_message || null,
  });
  if (!response.ok || data?.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
    throw new Error(data?.status === 'ZERO_RESULTS' ? 'LOCATION_GEOCODE_NOT_FOUND' : 'ROUTE_CALCULATION_FAILED');
  }
  const result = data.results[0];
  return {
    latitude: Number(result.geometry.location.lat),
    longitude: Number(result.geometry.location.lng),
    placeId: result.place_id,
    address: result.formatted_address || normalizedAddress,
  };
};

export const getAuthoritativeRoute = async (
  db: admin.firestore.Firestore,
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  waypoints: RouteCoordinate[] = [],
): Promise<AuthoritativeRoute> => {
  assertCoordinate(origin, 'origin');
  assertCoordinate(destination, 'destination');
  waypoints.forEach((waypoint, index) => assertCoordinate(waypoint, `waypoint_${index}`));

  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ROUTE_PROVIDER_NOT_CONFIGURED');

  const cacheInput = [origin, ...waypoints, destination]
    .map(point => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
    .join('|');
  const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');
  const requestId = cacheKey.slice(0, 12);
  const cacheRef = db.collection('routeCache').doc(`fare_${cacheKey}`);
  const cacheDoc = await cacheRef.get();
  if (cacheDoc.exists) {
    const cached = cacheDoc.data()!;
    const calculatedAt = cached.calculatedAt?.toDate?.() || new Date(cached.calculatedAt);
    if (Number.isFinite(calculatedAt.getTime()) && Date.now() - calculatedAt.getTime() < 24 * 60 * 60 * 1000) {
      console.log('[FARE_ROUTE] cache hit', { requestId, origin, destination, waypoints, distanceMeters: cached.distanceMeters });
      return {
        distanceMeters: cached.distanceMeters,
        durationSeconds: cached.durationSeconds,
        encodedPolyline: cached.encodedPolyline || '',
        provider: 'google',
        calculatedAt: calculatedAt.toISOString(),
        cacheHit: true,
      };
    }
  }

  const params = new URLSearchParams({
    origin: coordinateParam(origin),
    destination: coordinateParam(destination),
    mode: 'driving',
    key: apiKey,
  });
  if (waypoints.length) {
    params.set('waypoints', `optimize:true|${waypoints.map(coordinateParam).join('|')}`);
  }

  const diagnosticUrl = `https://maps.googleapis.com/maps/api/directions/json?${new URLSearchParams({
    origin: params.get('origin') || '',
    destination: params.get('destination') || '',
    mode: 'driving',
    ...(params.get('waypoints') ? { waypoints: params.get('waypoints')! } : {}),
  }).toString()}`;
  console.log('[FARE_ROUTE] provider request', { requestId, origin, destination, waypoints, url: diagnosticUrl });

  let response: Response;
  try {
    response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
  } catch (error: any) {
    console.error('[FARE_ROUTE] Google request failed:', error);
    throw new Error('ROUTE_PROVIDER_UNAVAILABLE');
  }
  const rawBody = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error('[FARE_ROUTE] provider returned non-JSON', { requestId, httpStatus: response.status, body: rawBody.slice(0, 1000) });
    throw new Error('ROUTE_PROVIDER_INVALID_RESPONSE');
  }
  console.log('[FARE_ROUTE] provider response', {
    requestId,
    httpStatus: response.status,
    providerStatus: data.status,
    errorMessage: data.error_message || null,
    routeCount: Array.isArray(data.routes) ? data.routes.length : 0,
  });
  if (!response.ok) {
    console.error('[FARE_ROUTE] provider HTTP failure', { requestId, httpStatus: response.status, body: rawBody.slice(0, 1000) });
    throw new Error(`ROUTE_PROVIDER_HTTP_${response.status}`);
  }
  if (data.status === 'ZERO_RESULTS' || !data.routes?.length) throw new Error('NO_ROUTE_FOUND');
  if (data.status === 'OVER_QUERY_LIMIT') throw new Error('ROUTE_PROVIDER_QUOTA_EXCEEDED');
  if (data.status !== 'OK') {
    console.error('[FARE_ROUTE] Google response:', data.status, data.error_message || '');
    throw new Error('ROUTE_CALCULATION_FAILED');
  }

  const route = data.routes[0];
  const distanceMeters = route.legs.reduce((sum: number, leg: any) => sum + Number(leg.distance?.value || 0), 0);
  const durationSeconds = route.legs.reduce((sum: number, leg: any) => sum + Number(leg.duration?.value || 0), 0);
  if (distanceMeters <= 0 || durationSeconds <= 0) throw new Error('INVALID_ROUTE_DISTANCE');

  const calculatedAt = new Date().toISOString();
  const result: AuthoritativeRoute = {
    distanceMeters,
    durationSeconds,
    encodedPolyline: route.overview_polyline?.points || '',
    provider: 'google',
    calculatedAt,
    cacheHit: false,
  };
  await cacheRef.set({
    ...result,
    calculatedAt: admin.firestore.Timestamp.fromDate(new Date(calculatedAt)),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  });
  return result;
};
