import { strict as assert } from 'node:assert';
import { calculatePassengerFare, calculateRidePricing, calculateTaxiPoolPricing, FareConfigSnapshot, getStoredBookingAmountPaise } from './fareService.js';

const config: FareConfigSnapshot = {
  version: 'test-cost-recovery-v2',
  currency: 'INR',
  fuelPricePerLiterPaise: 10000,
  defaultMileageKmPerLiter: 10,
  maintenanceCostPerKmPaise: 200,
  driverCostSharePercent: 20,
  passengerCostSharePercent: 80,
  minimumPassengerFarePaise: 100,
  minimumFareReferenceDistanceMeters: 18000,
  maximumPassengerFarePaise: 70000,
  maximumRideFarePaise: 70000,
  platformFeePaise: 0,
  tollHandlingPolicy: 'excluded',
  roundingPolicy: 'nearest_rupee',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
};

for (const km of [10, 12, 14, 18.77]) {
  const pricing = calculateRidePricing(km * 1000, 4, 'Petrol', undefined, config);
  assert.equal(pricing.fuelCostPerKmPaise, 1000);
  assert.equal(pricing.operatingCostPerKmPaise, 1200);
  assert.equal(pricing.estimatedTripCostPaise, Math.round(km * 12) * 100);
  assert.ok(pricing.automaticPassengerContributionPaise > 0);
}

const pricing = calculateRidePricing(14000, 4, 'Petrol', undefined, config);
const fareFor = (distanceMeters: number, detourMeters = 0, seatsBooked = 1) => calculatePassengerFare({
  driverRouteDistanceMeters: 14000,
  passengerRouteDistanceMeters: distanceMeters,
  incrementalDetourDistanceMeters: detourMeters,
  seatsBooked,
  ridePricing: pricing,
});
const tenKm = fareFor(10000);
const twelveKm = fareFor(12000);
const fourteenKm = fareFor(14000);
assert.ok(tenKm.totalAmountPaise < twelveKm.totalAmountPaise);
assert.ok(twelveKm.totalAmountPaise < fourteenKm.totalAmountPaise);
assert.equal(tenKm.operatingCostPaise, 12000);
assert.equal(fareFor(10000, 1000).detourCostPaise, 1200);
assert.equal(fareFor(10000, 0, 2).baseFarePaise, tenKm.baseFarePaise * 2);

const productionMinimumConfig = { ...config, minimumPassengerFarePaise: 3000 };
const realistic = calculateRidePricing(18770, 4, 'Petrol', undefined, productionMinimumConfig);
const realisticFare = calculatePassengerFare({
  driverRouteDistanceMeters: 18770,
  passengerRouteDistanceMeters: 18770,
  incrementalDetourDistanceMeters: 0,
  seatsBooked: 1,
  ridePricing: realistic,
});
assert.ok(realisticFare.totalAmountPaise >= 3000, '18.77 km fare must respect the configured minimum');
assert.notEqual(realisticFare.totalAmountPaise, 800, '18.77 km fare must not collapse to INR 8');
const shortPricing = calculateRidePricing(5000, 4, 'Petrol', undefined, productionMinimumConfig);
const mediumPricing = calculateRidePricing(10000, 4, 'Petrol', undefined, productionMinimumConfig);
const longPricing = calculateRidePricing(15000, 4, 'Petrol', undefined, productionMinimumConfig);
const contributionFor = (distanceMeters: number, ridePricing: ReturnType<typeof calculateRidePricing>) =>
  calculatePassengerFare({
    driverRouteDistanceMeters: distanceMeters,
    passengerRouteDistanceMeters: distanceMeters,
    incrementalDetourDistanceMeters: 0,
    seatsBooked: 1,
    ridePricing,
  }).totalAmountPaise;
assert.ok(contributionFor(5000, shortPricing) < contributionFor(10000, mediumPricing));
assert.ok(contributionFor(10000, mediumPricing) < contributionFor(15000, longPricing));

const cappedConfig = { ...config, maximumPassengerFarePaise: 70000, maximumRideFarePaise: 70000 };
const cappedPricing = calculateRidePricing(1000000, 1, 'Petrol', undefined, cappedConfig);
const cappedFare = calculatePassengerFare({
  driverRouteDistanceMeters: 1000000,
  passengerRouteDistanceMeters: 1000000,
  incrementalDetourDistanceMeters: 0,
  seatsBooked: 1,
  ridePricing: cappedPricing,
});
assert.equal(cappedFare.totalAmountPaise, 70000);

assert.throws(() => calculateRidePricing(0, 4, 'Petrol', undefined, config), /INVALID_ROUTE_DISTANCE/);
assert.throws(() => calculateRidePricing(-1, 4, 'Petrol', undefined, config), /INVALID_ROUTE_DISTANCE/);
assert.throws(() => calculateRidePricing(14000, 4, 'Petrol', 0, config), /INVALID_VEHICLE_MILEAGE/);

const lockedSnapshot = { fare: { totalAmountPaise: 4321 }, fareStatus: 'locked', totalPrice: 999 };
assert.equal(getStoredBookingAmountPaise(lockedSnapshot, true), 4321);
assert.throws(() => getStoredBookingAmountPaise({ ...lockedSnapshot, fareStatus: 'quoted' }, true), /FARE_NOT_LOCKED/);
assert.throws(() => getStoredBookingAmountPaise({ totalPrice: 120 }, true), /FARE_SNAPSHOT_MISSING/);
assert.throws(() => getStoredBookingAmountPaise({ fare: { totalAmountPaise: 0 }, fareStatus: 'locked' }, true), /INVALID_ORDER_AMOUNT/);
process.env.TAXI_FARE_CONFIG_VERSION = 'test-road-share-v1';
process.env.TAXI_BASE_FARE_PAISE = '0';
process.env.TAXI_PER_KM_PAISE = '2000';
process.env.TAXI_PER_MINUTE_PAISE = '0';
process.env.TAXI_MIN_VEHICLE_FARE_PAISE = '3000';
process.env.TAXI_MAX_VEHICLE_FARE_PAISE = '70000';
const taxi5km = calculateTaxiPoolPricing(5000, 900, 4);
const taxi10km = calculateTaxiPoolPricing(10000, 1800, 4);
const taxi15km = calculateTaxiPoolPricing(15000, 2700, 4);
assert.ok(taxi10km.totalVehicleFarePaise > taxi5km.totalVehicleFarePaise);
assert.ok(taxi15km.totalVehicleFarePaise > taxi10km.totalVehicleFarePaise);
assert.equal(taxi10km.perMemberFarePaise, Math.ceil(taxi10km.totalVehicleFarePaise / 4 / 100) * 100);
assert.equal(taxi10km.routeProvider, 'google');
console.log('fareService tests passed');