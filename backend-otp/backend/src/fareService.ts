export type RoundingPolicy = 'nearest_rupee' | 'ceil_rupee';
export type SupportedFuelType = 'Petrol' | 'Diesel' | 'EV';

export interface FareConfigSnapshot {
  version: string;
  currency: 'INR';
  fuelPricePerLiterPaise: number;
  defaultMileageKmPerLiter: number;
  maintenanceCostPerKmPaise: number;
  driverCostSharePercent: number;
  passengerCostSharePercent: number;
  minimumPassengerFarePaise: number;
  maximumPassengerFarePaise: number;
  maximumRideFarePaise: number;
  platformFeePaise: number;
  tollHandlingPolicy: 'excluded' | 'included';
  roundingPolicy: RoundingPolicy;
  effectiveFrom: string;
}

export interface RidePricing {
  version: string;
  currency: 'INR';
  fuelType: SupportedFuelType;
  fuelPricePerLiterPaise: number;
  mileageKmPerLiter: number;
  fuelCostPerKmPaise: number;
  maintenanceCostPerKmPaise: number;
  operatingCostPerKmPaise: number;
  estimatedFuelCostPaise: number;
  estimatedMaintenanceCostPaise: number;
  estimatedTripCostPaise: number;
  automaticPassengerContributionPaise: number;
  suggestedFarePaise: number;
  totalPassengerSeats: number;
  driverCostSharePercent: number;
  passengerCostSharePercent: number;
  minimumPassengerFarePaise: number;
  maximumPassengerFarePaise: number;
  maximumRideFarePaise: number;
  platformFeePaise: number;
  tollHandlingPolicy: 'excluded' | 'included';
  roundingPolicy: RoundingPolicy;
  effectiveFrom: string;
}

export interface FareSnapshot {
  currency: 'INR';
  baseFarePaise: number;
  distanceMeters: number;
  distanceKm: number;
  roadDistanceKm: number;
  driverRouteDistanceMeters: number;
  passengerRouteDistanceMeters: number;
  passengerSegmentDistanceKm: number;
  incrementalDetourDistanceMeters: number;
  detourDistanceKm: number;
  fuelPricePerLiterPaise: number;
  mileageKmPerLiter: number;
  fuelCostPerKmPaise: number;
  maintenanceCostPerKmPaise: number;
  operatingCostPerKmPaise: number;
  operatingCostPaise: number;
  passengerContributionPaise: number;
  tollAmountPaise: number;
  detourAmountPaise: number;
  detourCostPaise: number;
  platformFeePaise: number;
  totalAmountPaise: number;
  driverSharePaise: number;
  seatsBooked: number;
  pricingVersion: string;
  routeProvider: 'google';
  routeCalculatedAt: string;
  lockedAt?: string;
}

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const positiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const percent = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
};

export const getFareConfig = (): FareConfigSnapshot => {
  const passengerCostSharePercent = percent(process.env.FARE_PASSENGER_COST_SHARE_PERCENT, 80);
  const driverCostSharePercent = percent(process.env.FARE_DRIVER_COST_SHARE_PERCENT, 20);
  if (Math.abs(driverCostSharePercent + passengerCostSharePercent - 100) > 0.001) {
    throw new Error('INVALID_COST_SHARE_CONFIGURATION');
  }
  return {
    version: process.env.FARE_CONFIG_VERSION || '2026-08-25-cost-recovery-v2',
    currency: 'INR',
    fuelPricePerLiterPaise: positiveInt(process.env.FARE_FUEL_PRICE_PER_LITER_PAISE, 10631),
    defaultMileageKmPerLiter: positiveNumber(process.env.FARE_DEFAULT_MILEAGE_KM_PER_LITER, 15),
    maintenanceCostPerKmPaise: positiveInt(process.env.FARE_MAINTENANCE_COST_PER_KM_PAISE, 250),
    driverCostSharePercent,
    passengerCostSharePercent,
    minimumPassengerFarePaise: positiveInt(process.env.FARE_MIN_PASSENGER_PAISE, 3000),
    maximumPassengerFarePaise: positiveInt(process.env.FARE_MAX_PASSENGER_PAISE, 70000),
    maximumRideFarePaise: positiveInt(process.env.FARE_MAX_RIDE_PAISE, 70000),
    platformFeePaise: Math.max(0, Number(process.env.FARE_PLATFORM_FEE_PAISE || 0)),
    tollHandlingPolicy: 'excluded',
    roundingPolicy: process.env.FARE_ROUNDING_POLICY === 'ceil_rupee' ? 'ceil_rupee' : 'nearest_rupee',
    effectiveFrom: process.env.FARE_CONFIG_EFFECTIVE_FROM || '2026-08-25T00:00:00.000Z',
  };
};

const roundMoney = (paise: number, policy: RoundingPolicy): number => {
  if (!Number.isFinite(paise) || paise < 0) throw new Error('INVALID_FARE_AMOUNT');
  return (policy === 'ceil_rupee' ? Math.ceil(paise / 100) : Math.round(paise / 100)) * 100;
};

export const calculateRidePricing = (
  distanceMeters: number,
  totalSeats: number,
  fuelType: SupportedFuelType = 'Petrol',
  mileageKmPerLiter?: number,
  fareConfig = getFareConfig(),
): RidePricing => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('INVALID_ROUTE_DISTANCE');
  if (!Number.isInteger(totalSeats) || totalSeats < 1 || totalSeats > 6) throw new Error('INVALID_SEAT_COUNT');
  const mileage = mileageKmPerLiter == null ? fareConfig.defaultMileageKmPerLiter : mileageKmPerLiter;
  if (!Number.isFinite(mileage) || mileage <= 0) throw new Error('INVALID_VEHICLE_MILEAGE');

  const roadDistanceKm = distanceMeters / 1000;
  const fuelCostPerKmPaise = fareConfig.fuelPricePerLiterPaise / mileage;
  const operatingCostPerKmPaise = fuelCostPerKmPaise + fareConfig.maintenanceCostPerKmPaise;
  const estimatedFuelCostPaise = roundMoney(roadDistanceKm * fuelCostPerKmPaise, fareConfig.roundingPolicy);
  const estimatedMaintenanceCostPaise = roundMoney(roadDistanceKm * fareConfig.maintenanceCostPerKmPaise, fareConfig.roundingPolicy);
  const estimatedTripCostPaise = roundMoney(roadDistanceKm * operatingCostPerKmPaise, fareConfig.roundingPolicy);
  const contribution = estimatedTripCostPaise * (fareConfig.passengerCostSharePercent / 100) / totalSeats;
  const automaticPassengerContributionPaise = Math.min(
    fareConfig.maximumPassengerFarePaise,
    fareConfig.maximumRideFarePaise,
    roundMoney(Math.max(fareConfig.minimumPassengerFarePaise, contribution), fareConfig.roundingPolicy),
  );

  return {
    version: fareConfig.version,
    currency: fareConfig.currency,
    fuelType,
    fuelPricePerLiterPaise: fareConfig.fuelPricePerLiterPaise,
    mileageKmPerLiter: mileage,
    fuelCostPerKmPaise,
    maintenanceCostPerKmPaise: fareConfig.maintenanceCostPerKmPaise,
    operatingCostPerKmPaise,
    estimatedFuelCostPaise,
    estimatedMaintenanceCostPaise,
    estimatedTripCostPaise,
    automaticPassengerContributionPaise,
    suggestedFarePaise: automaticPassengerContributionPaise,
    totalPassengerSeats: totalSeats,
    driverCostSharePercent: fareConfig.driverCostSharePercent,
    passengerCostSharePercent: fareConfig.passengerCostSharePercent,
    minimumPassengerFarePaise: fareConfig.minimumPassengerFarePaise,
    maximumPassengerFarePaise: fareConfig.maximumPassengerFarePaise,
    maximumRideFarePaise: fareConfig.maximumRideFarePaise,
    platformFeePaise: fareConfig.platformFeePaise,
    tollHandlingPolicy: fareConfig.tollHandlingPolicy,
    roundingPolicy: fareConfig.roundingPolicy,
    effectiveFrom: fareConfig.effectiveFrom,
  };
};

export const calculatePassengerFare = (input: {
  driverRouteDistanceMeters: number;
  passengerRouteDistanceMeters: number;
  incrementalDetourDistanceMeters: number;
  seatsBooked: number;
  ridePricing: RidePricing;
  routeCalculatedAt?: string;
}): FareSnapshot => {
  const { ridePricing } = input;
  if (input.driverRouteDistanceMeters <= 0 || input.passengerRouteDistanceMeters <= 0) throw new Error('INVALID_ROUTE_DISTANCE');
  if (!Number.isInteger(input.seatsBooked) || input.seatsBooked < 1) throw new Error('INVALID_SEAT_COUNT');

  const passengerDistanceKm = input.passengerRouteDistanceMeters / 1000;
  const detourDistanceKm = Math.max(0, input.incrementalDetourDistanceMeters) / 1000;
  const operatingCostPaise = roundMoney(passengerDistanceKm * ridePricing.operatingCostPerKmPaise, ridePricing.roundingPolicy);
  const allocatedContribution = operatingCostPaise
    * (ridePricing.passengerCostSharePercent / 100)
    / ridePricing.totalPassengerSeats
    * input.seatsBooked;
  const minimumForSeats = ridePricing.minimumPassengerFarePaise * input.seatsBooked;
  const baseFarePaise = Math.min(
    ridePricing.maximumPassengerFarePaise * input.seatsBooked,
    roundMoney(Math.max(minimumForSeats, allocatedContribution), ridePricing.roundingPolicy),
  );
  const detourCostPaise = roundMoney(detourDistanceKm * ridePricing.operatingCostPerKmPaise, ridePricing.roundingPolicy);
  const passengerContributionPaise = baseFarePaise + detourCostPaise;
  const uncappedTotal = passengerContributionPaise + ridePricing.platformFeePaise;
  const totalAmountPaise = Math.min(ridePricing.maximumRideFarePaise, roundMoney(uncappedTotal, ridePricing.roundingPolicy));
  if (totalAmountPaise <= 0) throw new Error('INVALID_FARE_AMOUNT');

  return {
    currency: 'INR',
    baseFarePaise,
    distanceMeters: input.passengerRouteDistanceMeters,
    distanceKm: Number(passengerDistanceKm.toFixed(2)),
    roadDistanceKm: Number(passengerDistanceKm.toFixed(2)),
    driverRouteDistanceMeters: input.driverRouteDistanceMeters,
    passengerRouteDistanceMeters: input.passengerRouteDistanceMeters,
    passengerSegmentDistanceKm: Number(passengerDistanceKm.toFixed(2)),
    incrementalDetourDistanceMeters: Math.max(0, input.incrementalDetourDistanceMeters),
    detourDistanceKm: Number(detourDistanceKm.toFixed(2)),
    fuelPricePerLiterPaise: ridePricing.fuelPricePerLiterPaise,
    mileageKmPerLiter: ridePricing.mileageKmPerLiter,
    fuelCostPerKmPaise: ridePricing.fuelCostPerKmPaise,
    maintenanceCostPerKmPaise: ridePricing.maintenanceCostPerKmPaise,
    operatingCostPerKmPaise: ridePricing.operatingCostPerKmPaise,
    operatingCostPaise,
    passengerContributionPaise,
    tollAmountPaise: 0,
    detourAmountPaise: detourCostPaise,
    detourCostPaise,
    platformFeePaise: ridePricing.platformFeePaise,
    totalAmountPaise,
    driverSharePaise: totalAmountPaise - ridePricing.platformFeePaise,
    seatsBooked: input.seatsBooked,
    pricingVersion: ridePricing.version,
    routeProvider: 'google',
    routeCalculatedAt: input.routeCalculatedAt || new Date().toISOString(),
  };
};

export const paiseToRupees = (paise: number): number => Number((paise / 100).toFixed(2));
export const getStoredBookingAmountPaise = (booking: any, requireLocked = false): number => {
  if (booking?.fare?.totalAmountPaise == null) throw new Error('FARE_SNAPSHOT_MISSING');
  if (requireLocked && booking.fareStatus !== 'locked') throw new Error('FARE_NOT_LOCKED');
  const amount = Number(booking.fare.totalAmountPaise);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 70000) throw new Error('INVALID_ORDER_AMOUNT');
  return amount;
};
export interface TaxiPoolPricingSnapshot {
  product: 'taxi_pool';
  version: string;
  currency: 'INR';
  routeProvider: 'google';
  distanceMeters: number;
  durationSeconds: number;
  baseFarePaise: number;
  distanceFarePaise: number;
  durationFarePaise: number;
  totalVehicleFarePaise: number;
  perMemberFarePaise: number;
  maxMembers: number;
  perKmPaise: number;
  perMinutePaise: number;
  minimumVehicleFarePaise: number;
  maximumVehicleFarePaise: number;
  calculatedAt: string;
}

const requiredNonNegativeInt = (name: string): number => {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 0) throw new Error('MISSING_' + name);
  return value;
};

const requiredPositiveInt = (name: string): number => {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error('MISSING_' + name);
  return value;
};

export const calculateTaxiPoolPricing = (
  distanceMeters: number,
  durationSeconds: number,
  maxMembers: number,
): TaxiPoolPricingSnapshot => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('INVALID_ROUTE_DISTANCE');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('INVALID_ROUTE_DURATION');
  if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 6) throw new Error('INVALID_MEMBER_COUNT');

  const version = String(process.env.TAXI_FARE_CONFIG_VERSION || '').trim();
  if (!version) throw new Error('MISSING_TAXI_FARE_CONFIG_VERSION');
  const baseFarePaise = requiredNonNegativeInt('TAXI_BASE_FARE_PAISE');
  const perKmPaise = requiredNonNegativeInt('TAXI_PER_KM_PAISE');
  const perMinutePaise = requiredNonNegativeInt('TAXI_PER_MINUTE_PAISE');
  const minimumVehicleFarePaise = requiredPositiveInt('TAXI_MIN_VEHICLE_FARE_PAISE');
  const maximumVehicleFarePaise = requiredPositiveInt('TAXI_MAX_VEHICLE_FARE_PAISE');
  if (maximumVehicleFarePaise < minimumVehicleFarePaise || (perKmPaise === 0 && perMinutePaise === 0)) {
    throw new Error('INVALID_TAXI_FARE_CONFIGURATION');
  }

  const distanceFarePaise = roundMoney((distanceMeters / 1000) * perKmPaise, 'ceil_rupee');
  const durationFarePaise = roundMoney((durationSeconds / 60) * perMinutePaise, 'ceil_rupee');
  const uncapped = baseFarePaise + distanceFarePaise + durationFarePaise;
  const totalVehicleFarePaise = Math.min(maximumVehicleFarePaise, Math.max(minimumVehicleFarePaise, uncapped));
  const perMemberFarePaise = Math.ceil(totalVehicleFarePaise / maxMembers / 100) * 100;

  return {
    product: 'taxi_pool', version, currency: 'INR', routeProvider: 'google',
    distanceMeters: Math.round(distanceMeters), durationSeconds: Math.round(durationSeconds),
    baseFarePaise, distanceFarePaise, durationFarePaise, totalVehicleFarePaise,
    perMemberFarePaise, maxMembers, perKmPaise, perMinutePaise,
    minimumVehicleFarePaise, maximumVehicleFarePaise,
    calculatedAt: new Date().toISOString(),
  };
};