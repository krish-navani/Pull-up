import { Request, Response, Router } from 'express';
import admin from 'firebase-admin';
import { getDb } from './firebase.js';
import { calculatePassengerFare, calculateRidePricing, getFareConfig, paiseToRupees, RidePricing } from './fareService.js';
import { geocodeAddress, getAuthoritativeRoute, RouteCoordinate } from './fareRouteService.js';
import { canonicalizeAtlasEndpoint, isAtlasEndpoint } from './atlasConfig.js';

type Notify = (
  userId: string, type: string, title: string, message: string,
  rideId?: string | null, bookingId?: string | null, targetScreen?: string | null, targetId?: string | null,
) => Promise<unknown>;

const authenticatedUid = async (req: Request): Promise<string> => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('UNAUTHENTICATED');
  return (await admin.auth().verifyIdToken(token)).uid;
};

const coordinate = (value: any, field: string): RouteCoordinate & { address: string; city?: string } => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error(`MISSING_${field.toUpperCase()}_COORDINATES`);
  return {
    latitude,
    longitude,
    address: String(value?.address || ''),
    ...(value?.city ? { city: String(value.city) } : {}),
    ...(value?.placeId ? { placeId: String(value.placeId) } : {}),
  };
};

const resolveCoordinate = async (value: any, field: string): Promise<RouteCoordinate & { address: string; city?: string }> => {
  try {
    return coordinate(value, field);
  } catch (error: any) {
    if (!String(error?.message || '').startsWith('MISSING_')) throw error;
    const address = String(value?.address || value?.name || '').trim();
    console.log('[FARE_GEOCODE] resolving legacy address-only endpoint', { field, address });
    return geocodeAddress(address);
  }
};

const validateAtlasRoute = (origin: RouteCoordinate, destination: RouteCoordinate): void => {
  const originIsAtlas = isAtlasEndpoint(origin);
  const destinationIsAtlas = isAtlasEndpoint(destination);
  if (originIsAtlas === destinationIsAtlas) throw new Error('EXACTLY_ONE_ATLAS_ENDPOINT_REQUIRED');
};

const searchIndex = (...values: Array<string | undefined>): string[] => {
  const tokens = new Set<string>();
  for (const value of values) {
    String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(token => token.length >= 2).forEach(token => tokens.add(token));
  }
  return [...tokens];
};

const ridePricing = (ride: any, distanceMeters: number): RidePricing => {
  if (ride?.pricing?.version && Number.isFinite(ride.pricing.operatingCostPerKmPaise)) return ride.pricing;
  return calculateRidePricing(
    distanceMeters,
    Number(ride.totalSeats || ride.availableSeats),
    ride.fuelType || 'Petrol',
  );
};

const fail = (res: Response, error: any) => {
  const code = String(error?.message || 'FARE_CALCULATION_FAILED');
  const status = code === 'UNAUTHENTICATED' ? 401
    : code.includes('NOT_FOUND') ? 404
    : code.includes('UNAVAILABLE') || code.includes('QUOTA') || code.includes('NOT_CONFIGURED') ? 503
    : 400;
  const messages: Record<string, string> = {
    UNAUTHENTICATED: 'Please sign in again.',
    EXACTLY_ONE_ATLAS_ENDPOINT_REQUIRED: 'Exactly one ride endpoint must be Atlas SkillTech University.',
    DRIVER_FARE_OUT_OF_RANGE: 'Selected fare is outside the permitted cost-sharing range.',
    ROUTE_PROVIDER_UNAVAILABLE: 'Road route calculation is temporarily unavailable. Please retry.',
    ROUTE_PROVIDER_QUOTA_EXCEEDED: 'Road route calculation is temporarily at capacity. Please retry later.',
    ROUTE_PROVIDER_NOT_CONFIGURED: 'Road route calculation is not configured.',
    NO_ROUTE_FOUND: 'No drivable route was found for these locations.',
    LEGACY_RIDE_FARE_UNAVAILABLE: 'This older ride cannot accept a new authoritative fare booking.',
    DETOUR_BUDGET_EXCEEDED: 'This pickup exceeds the driver\'s remaining detour allowance.',
    FARE_QUOTE_STALE: 'The ride fare changed. Please review the latest quote.',
    RIDE_EXPIRED: 'This ride has already departed. Please choose another ride.',
    LOCATION_GEOCODE_NOT_FOUND: 'We could not locate one of the ride addresses. Please choose another ride.',
  };
  return res.status(status).json({ success: false, code, message: messages[code] || 'Fare could not be calculated from this route.' });
};

const bookingQuote = async (db: admin.firestore.Firestore, ride: any, input: any) => {
  const rawPickup = await resolveCoordinate(input.pickupLocation, 'pickup');
  const rawDrop = await resolveCoordinate(input.dropLocation, 'drop');
  const pickup = canonicalizeAtlasEndpoint(rawPickup);
  const drop = canonicalizeAtlasEndpoint(rawDrop);
  const seatsBooked = Number(input.seatsBooked);
  if (!Number.isInteger(seatsBooked) || seatsBooked < 1 || seatsBooked > 6) throw new Error('INVALID_SEAT_COUNT');
  const origin = canonicalizeAtlasEndpoint(await resolveCoordinate(ride.pickupLocation, 'ride_origin'));
  const destination = canonicalizeAtlasEndpoint(await resolveCoordinate(ride.dropLocation, 'ride_destination'));
  console.log('[FARE] booking quote input', {
    rideId: input.rideId,
    request: { pickup: rawPickup, drop: rawDrop, seatsBooked },
    normalized: { pickup, drop },
    ride: { pickup: ride.pickupLocation, drop: ride.dropLocation, route: ride.route || null },
  });
  const passengerRoute = await getAuthoritativeRoute(db, pickup, drop);
  let baselineDistance = Number(ride.route?.distanceMeters || ride.baselineDistanceMeters);
  let resolvedBaselineRoute = null;
  if (!Number.isFinite(baselineDistance) || baselineDistance <= 0) {
    resolvedBaselineRoute = await getAuthoritativeRoute(db, origin, destination);
    baselineDistance = resolvedBaselineRoute.distanceMeters;
  }
  const legacyMetadataMissing = !Number.isFinite(Number(ride.pickupLocation?.latitude))
    || !Number.isFinite(Number(ride.pickupLocation?.longitude))
    || !Number.isFinite(Number(ride.dropLocation?.latitude))
    || !Number.isFinite(Number(ride.dropLocation?.longitude))
    || !Number.isFinite(Number(ride.route?.distanceMeters));
  if (legacyMetadataMissing && input.rideId) {
    const routeMetadata = resolvedBaselineRoute || ride.route;
    await db.collection('rides').doc(String(input.rideId)).set({
      pickupLocation: origin,
      dropLocation: destination,
      baselineDistanceMeters: baselineDistance,
      route: {
        ...(ride.route || {}),
        origin,
        destination,
        originPlaceId: origin.placeId || null,
        destinationPlaceId: destination.placeId || null,
        distanceMeters: baselineDistance,
        durationSeconds: Number(routeMetadata?.durationSeconds || ride.baselineDurationSeconds || 0),
        encodedPolyline: routeMetadata?.encodedPolyline || ride.routePolyline || '',
        provider: 'google',
        calculatedAt: routeMetadata?.calculatedAt || new Date().toISOString(),
      },
      updatedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });
    console.log('[FARE] cached resolved legacy ride metadata', { rideId: input.rideId, origin, destination, baselineDistance });
  }
  const pricing = ridePricing(ride, baselineDistance);
  const detourRoute = await getAuthoritativeRoute(db, origin, destination, [pickup]);
  const detourMeters = Math.max(0, detourRoute.distanceMeters - baselineDistance);
  const remainingDetour = Number(ride.remainingDetourBudgetMeters ?? ride.detourRadiusMeters ?? 0);
  if (detourMeters > (remainingDetour > 0 ? remainingDetour : 500)) throw new Error('DETOUR_BUDGET_EXCEEDED');
  const fare = calculatePassengerFare({
    driverRouteDistanceMeters: baselineDistance,
    passengerRouteDistanceMeters: passengerRoute.distanceMeters,
    incrementalDetourDistanceMeters: detourMeters,
    seatsBooked,
    ridePricing: pricing,
    routeCalculatedAt: passengerRoute.calculatedAt,
  });
  console.log('[FARE] booking quote result', { rideId: input.rideId, fare });
  return fare;
};

export const registerFareRoutes = (router: Router, notify: Notify): void => {
  router.post('/fare/ride-quote', async (req, res) => {
    try {
      await authenticatedUid(req);
      const rawPickup = coordinate(req.body.pickupLocation, 'pickup');
      const rawDrop = coordinate(req.body.dropLocation, 'drop');
      validateAtlasRoute(rawPickup, rawDrop);
      const pickup = canonicalizeAtlasEndpoint(rawPickup);
      const drop = canonicalizeAtlasEndpoint(rawDrop);
      const route = await getAuthoritativeRoute(getDb(), pickup, drop);
      const pricing = calculateRidePricing(route.distanceMeters, Number(req.body.totalSeats), req.body.fuelType || 'Petrol');
      return res.json({ success: true, route, pricing, display: {
        roadDistanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
        estimatedTripCost: paiseToRupees(pricing.estimatedTripCostPaise),
        passengerContribution: paiseToRupees(pricing.automaticPassengerContributionPaise),
        suggestedFare: paiseToRupees(pricing.automaticPassengerContributionPaise),
      }});
    } catch (error: any) {
      console.error('[FARE] ride quote:', error);
      return fail(res, error);
    }
  });

  router.post('/fare/create-ride', async (req, res) => {
    try {
      const driverId = await authenticatedUid(req);
      const db = getDb();
      const userDoc = await db.collection('users').doc(driverId).get();
      if (!userDoc.exists) throw new Error('DRIVER_NOT_FOUND');
      const user = userDoc.data()!;
      if (!(user.licenseVerified === true || ['approved', 'verified'].includes(user.licenseVerificationStatus))) {
        throw new Error('DRIVER_LICENSE_NOT_APPROVED');
      }
      const rawPickup = coordinate(req.body.pickupLocation, 'pickup');
      const rawDrop = coordinate(req.body.dropLocation, 'drop');
      validateAtlasRoute(rawPickup, rawDrop);
      const pickup = canonicalizeAtlasEndpoint(rawPickup);
      const drop = canonicalizeAtlasEndpoint(rawDrop);
      const departure = new Date(req.body.departureTime);
      if (!Number.isFinite(departure.getTime()) || departure.getTime() <= Date.now()) throw new Error('INVALID_DEPARTURE_TIME');
      const totalSeats = Number(req.body.totalSeats ?? req.body.availableSeats);
      const route = await getAuthoritativeRoute(db, pickup, drop);
      const pricing = calculateRidePricing(route.distanceMeters, totalSeats, req.body.fuelType || 'Petrol');
      const detourRadiusMeters = Math.max(0, Number(req.body.detourRadiusMeters || 0));
      const ref = db.collection('rides').doc();
      await ref.set({
        driverId, driverName: user.fullName || 'Driver', pickupLocation: pickup, dropLocation: drop,
        searchIndex: searchIndex(pickup.address, pickup.city, drop.address, drop.city, user.fullName, pickup.placeId, drop.placeId),
        departureTime: departure.toISOString(), price: paiseToRupees(pricing.automaticPassengerContributionPaise),
        availableSeats: totalSeats, totalSeats, carModel: String(req.body.carModel || ''),
        fuelType: req.body.fuelType || 'Petrol', carColor: req.body.carColor || '', description: req.body.description || '',
        detourRadiusMeters, remainingDetourBudgetMeters: detourRadiusMeters,
        route: { origin: pickup, destination: drop, originPlaceId: pickup.placeId || null,
          destinationPlaceId: drop.placeId || null, distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds, provider: route.provider, calculatedAt: route.calculatedAt },
        pricing, baselineDistanceMeters: route.distanceMeters, baselineDurationSeconds: route.durationSeconds,
        currentDistanceMeters: route.distanceMeters, currentDurationSeconds: route.durationSeconds,
        routePolyline: route.encodedPolyline, bookedSeats: [], acceptedWaypoints: [], routeVersion: 1,
        optimizationStatus: 'completed', optimizationSource: 'google', status: 'active',
        createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now(),
      });
      return res.status(201).json({ success: true, rideId: ref.id, route, pricing });
    } catch (error: any) {
      console.error('[FARE] create ride:', error);
      return fail(res, error);
    }
  });

  router.post('/fare/booking-quote', async (req, res) => {
    try {
      await authenticatedUid(req);
      const db = getDb();
      const rideDoc = await db.collection('rides').doc(String(req.body.rideId || '')).get();
      if (!rideDoc.exists) throw new Error('RIDE_NOT_FOUND');
      const fare = await bookingQuote(db, rideDoc.data(), req.body);
      return res.json({ success: true, fare, totalAmount: paiseToRupees(fare.totalAmountPaise) });
    } catch (error: any) {
      console.error('[FARE] booking quote:', error);
      return fail(res, error);
    }
  });

  router.post('/fare/create-booking', async (req, res) => {
    try {
      const passengerId = await authenticatedUid(req);
      const db = getDb();
      const rideId = String(req.body.rideId || '');
      const rideRef = db.collection('rides').doc(rideId);
      const initialRide = await rideRef.get();
      if (!initialRide.exists) throw new Error('RIDE_NOT_FOUND');
      const initial = initialRide.data()!;
      if (initial.driverId === passengerId) throw new Error('OWN_RIDE_BOOKING');
      const fare = await bookingQuote(db, initial, req.body);
      const passenger = (await db.collection('users').doc(passengerId).get()).data() || {};
      const bookingId = `${rideId}_${passengerId}`;
      const bookingRef = db.collection('bookings').doc(bookingId);
      await db.runTransaction(async transaction => {
        const [rideDoc, existing] = await Promise.all([transaction.get(rideRef), transaction.get(bookingRef)]);
        if (!rideDoc.exists) throw new Error('RIDE_NOT_FOUND');
        const ride = rideDoc.data()!;
        if (ride.status !== 'active') throw new Error('RIDE_NOT_ACTIVE');
        if (new Date(ride.departureTime).getTime() <= Date.now()) throw new Error('RIDE_EXPIRED');
        if (ride.availableSeats < fare.seatsBooked) throw new Error('INSUFFICIENT_SEATS');
        if (existing.exists && ['pending', 'accepted', 'confirmed'].includes(existing.data()!.status)) throw new Error('DUPLICATE_BOOKING');
        if (ride.pricing && (ride.pricing.version !== fare.pricingVersion || Number(ride.route?.distanceMeters) !== fare.driverRouteDistanceMeters)) throw new Error('FARE_QUOTE_STALE');
        const totalPrice = paiseToRupees(fare.totalAmountPaise);
        transaction.set(bookingRef, {
          rideId, passengerId, passengerName: passenger.fullName || 'Passenger', passengerEmail: passenger.email || '',
          driverId: ride.driverId, seatsBooked: fare.seatsBooked, pricePerSeat: totalPrice / fare.seatsBooked,
          totalPrice, fare, fareStatus: 'quoted', status: 'pending', paymentStatus: 'pending',
          passengerPickupLocation: coordinate(req.body.pickupLocation, 'pickup'),
          passengerDropLocation: coordinate(req.body.dropLocation, 'drop'),
          passengerOriginalLocation: req.body.detourMeta?.passengerOriginalLocation || null,
          passengerSelectedPickup: req.body.detourMeta?.passengerSelectedPickup || req.body.pickupLocation,
          extraDistanceMeters: fare.incrementalDetourDistanceMeters,
          extraDurationSeconds: Number(req.body.detourMeta?.extraDurationSeconds || 0),
          walkingDistanceMeters: Number(req.body.detourMeta?.walkingDistanceMeters || 0),
          expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
          bookedAt: admin.firestore.Timestamp.now(), createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now(),
        });
        const bookedSeats = (ride.bookedSeats || []).filter((entry: any) => entry.passengerId !== passengerId);
        transaction.update(rideRef, { bookedSeats: [...bookedSeats, {
          passengerId, passengerName: passenger.fullName || 'Passenger', seatsBooked: fare.seatsBooked,
          totalPrice, status: 'pending', bookedAt: new Date().toISOString(),
        }], updatedAt: admin.firestore.Timestamp.now() });
      });
      await notify(initial.driverId, 'booking_request', 'New Booking Request',
        `${passenger.fullName || 'A passenger'} requested ${fare.seatsBooked} seat(s).`, rideId, bookingId, 'my-bookings', bookingId)
        .catch(error => console.error('[FARE] booking notification failed:', error));
      return res.status(201).json({ success: true, bookingId, fare, totalAmount: paiseToRupees(fare.totalAmountPaise) });
    } catch (error: any) {
      console.error('[FARE] create booking:', error);
      return fail(res, error);
    }
  });

  router.post('/fare/accept-booking', async (req, res) => {
    try {
      const driverId = await authenticatedUid(req);
      const db = getDb();
      const bookingId = String(req.body.bookingId || '');
      const bookingRef = db.collection('bookings').doc(bookingId);
      const result = await db.runTransaction(async transaction => {
        const bookingDoc = await transaction.get(bookingRef);
        if (!bookingDoc.exists) throw new Error('BOOKING_NOT_FOUND');
        const booking = bookingDoc.data()!;
        if (booking.driverId !== driverId) throw new Error('UNAUTHORIZED_BOOKING_ACCESS');
        if (booking.status !== 'pending') throw new Error('INVALID_BOOKING_STATUS');
        if (!booking.fare?.totalAmountPaise) throw new Error('FARE_SNAPSHOT_MISSING');
        const rideRef = db.collection('rides').doc(booking.rideId);
        const rideDoc = await transaction.get(rideRef);
        if (!rideDoc.exists) throw new Error('RIDE_NOT_FOUND');
        const ride = rideDoc.data()!;
        if (ride.availableSeats < booking.seatsBooked) throw new Error('INSUFFICIENT_SEATS');
        const lockedAt = new Date().toISOString();
        transaction.update(bookingRef, { status: 'accepted', fareStatus: 'locked', 'fare.lockedAt': lockedAt,
          expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), updatedAt: admin.firestore.Timestamp.now() });
        transaction.update(rideRef, { bookedSeats: (ride.bookedSeats || []).map((entry: any) =>
          entry.passengerId === booking.passengerId ? { ...entry, status: 'accepted' } : entry), updatedAt: admin.firestore.Timestamp.now() });
        return booking;
      });
      await notify(result.passengerId, 'booking_accepted', 'Booking Approved',
        'Your fare is locked. Complete payment to confirm your seat.', result.rideId, bookingId, 'my-bookings', bookingId)
        .catch(error => console.error('[FARE] acceptance notification failed:', error));
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[FARE] accept booking:', error);
      return fail(res, error);
    }
  });
};
