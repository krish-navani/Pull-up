/**
 * Car Owner Calculator Service
 *
 * CALCULATION MODEL:
 * ─────────────────────────────────────────────────────
 * Solo Cost (daily)   = (roundTrip / mileage) × fuelPrice
 * Pool Cost (daily)   = Solo Cost / numberOfPassengers
 * Daily Savings       = Solo Cost − Pool Cost
 *
 * CO2 saved = total fleet reduction (N solo cars → 1 shared car)
 */

export interface CalculatorInputs {
  oneWayDistance: number;      // km
  daysPerMonth: number;        // 1-31
  monthsPerYear: number;       // 1-12
  carMileage: number;          // km/liter
  fuelPrice: number;           // ₹ per liter
  numberOfPassengers: number;  // 2-6 (total people including driver)
}

export interface CalculatorResults {
  roundTripDistance: number;
  monthlyDistance: number;
  yearlyDistance: number;

  soloDailyFuelCost: number;
  soloMonthlyFuelCost: number;
  soloYearlyFuelCost: number;

  totalDailyCarpoolCost: number;
  totalMonthlyCarpolCost: number;
  totalYearlyCarpolCost: number;

  dailySavings: number;
  monthlySavings: number;
  yearlySavings: number;
  savingsPercentage: number;

  costComparison: {
    label: string;
    solo: number;
    carpool: number;
    savings: number;
  }[];

  dailyCO2Reduction: number;
  monthlyCO2Reduction: number;
  yearlyCO2Reduction: number;
  treeEquivalent: number;

  monthlyBreakdown: {
    fuel: number;
    total: number;
  };
}

const CO2_KG_PER_LITER   = 2.31;
const TREES_PER_TON_CO2  = 16.67;

export class CarOwnerCalculatorService {
  static calculate(inputs: CalculatorInputs): CalculatorResults {
    this.validateInputs(inputs);

    const roundTripDistance = inputs.oneWayDistance * 2;
    const monthlyDistance   = roundTripDistance * inputs.daysPerMonth;
    const yearlyDistance    = monthlyDistance  * inputs.monthsPerYear;

    // Solo cost
    const litersPerDay        = roundTripDistance / inputs.carMileage;
    const soloDailyFuelCost   = litersPerDay * inputs.fuelPrice;
    const soloMonthlyFuelCost = soloDailyFuelCost * inputs.daysPerMonth;
    const soloYearlyFuelCost  = soloMonthlyFuelCost * inputs.monthsPerYear;

    // Pool cost = solo cost split equally among all passengers
    const totalDailyCarpoolCost   = soloDailyFuelCost / inputs.numberOfPassengers;
    const totalMonthlyCarpolCost  = totalDailyCarpoolCost * inputs.daysPerMonth;
    const totalYearlyCarpolCost   = totalMonthlyCarpolCost * inputs.monthsPerYear;

    // Savings
    const dailySavings      = soloDailyFuelCost   - totalDailyCarpoolCost;
    const monthlySavings    = soloMonthlyFuelCost - totalMonthlyCarpolCost;
    const yearlySavings     = soloYearlyFuelCost  - totalYearlyCarpolCost;
    const savingsPercentage = soloYearlyFuelCost > 0
      ? (yearlySavings / soloYearlyFuelCost) * 100
      : 0;

    // CO2: N solo cars vs 1 shared car
    const soloFleetLitersPerDay = litersPerDay * inputs.numberOfPassengers;
    const dailyCO2Reduction     = (soloFleetLitersPerDay - litersPerDay) * CO2_KG_PER_LITER;
    const monthlyCO2Reduction   = dailyCO2Reduction * inputs.daysPerMonth;
    const yearlyCO2Reduction    = monthlyCO2Reduction * inputs.monthsPerYear;
    const treeEquivalent        = (yearlyCO2Reduction / 1000) * TREES_PER_TON_CO2;

    const costComparison = [
      { label: 'Daily',   solo: round2(soloDailyFuelCost),   carpool: round2(totalDailyCarpoolCost),  savings: round2(dailySavings)   },
      { label: 'Monthly', solo: round2(soloMonthlyFuelCost), carpool: round2(totalMonthlyCarpolCost), savings: round2(monthlySavings) },
      { label: 'Yearly',  solo: round2(soloYearlyFuelCost),  carpool: round2(totalYearlyCarpolCost),  savings: round2(yearlySavings)  },
    ];

    return {
      roundTripDistance,
      monthlyDistance:        round2(monthlyDistance),
      yearlyDistance:         round2(yearlyDistance),
      soloDailyFuelCost:      round2(soloDailyFuelCost),
      soloMonthlyFuelCost:    round2(soloMonthlyFuelCost),
      soloYearlyFuelCost:     round2(soloYearlyFuelCost),
      totalDailyCarpoolCost:  round2(totalDailyCarpoolCost),
      totalMonthlyCarpolCost: round2(totalMonthlyCarpolCost),
      totalYearlyCarpolCost:  round2(totalYearlyCarpolCost),
      dailySavings:           round2(dailySavings),
      monthlySavings:         round2(monthlySavings),
      yearlySavings:          round2(yearlySavings),
      savingsPercentage:      Math.round(savingsPercentage * 10) / 10,
      costComparison,
      dailyCO2Reduction:      round2(dailyCO2Reduction),
      monthlyCO2Reduction:    round2(monthlyCO2Reduction),
      yearlyCO2Reduction:     round2(yearlyCO2Reduction),
      treeEquivalent:         Math.round(treeEquivalent * 10) / 10,
      monthlyBreakdown: {
        fuel:  round2(totalMonthlyCarpolCost),
        total: round2(totalMonthlyCarpolCost),
      },
    };
  }

  private static validateInputs(inputs: CalculatorInputs): void {
    if (inputs.oneWayDistance <= 0 || inputs.oneWayDistance > 500)
      throw new Error('Distance must be between 1 km and 500 km');
    if (inputs.daysPerMonth < 1 || inputs.daysPerMonth > 31)
      throw new Error('Days per month must be between 1 and 31');
    if (inputs.monthsPerYear < 1 || inputs.monthsPerYear > 12)
      throw new Error('Months per year must be between 1 and 12');
    if (inputs.carMileage <= 0 || inputs.carMileage > 50)
      throw new Error('Mileage must be between 1 and 50 km/l');
    if (inputs.fuelPrice <= 0)
      throw new Error('Fuel price must be greater than 0');
    if (inputs.numberOfPassengers < 2 || inputs.numberOfPassengers > 6)
      throw new Error('Number of passengers must be 2–6');
  }

  static getCO2Message(yearlyCO2KgReduction: number): string {
    const tons  = (yearlyCO2KgReduction / 1000).toFixed(2);
    const trees = Math.round((yearlyCO2KgReduction / 1000) * TREES_PER_TON_CO2);
    return `Saving ${tons} tons of CO₂ annually — equivalent to planting ${trees} trees 🌳`;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
