export interface MonthlyMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuel: number;
  idleTimeMinutes: number;
  totalFuel: number;
  drivingFuel: number;
  utilPct: number;
}

export interface UnitMetrics {
  vin: string;
  unitNumber: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
  totalFuelGal: number;
  drivingFuelGal: number;
  driveTimeHrs: number;
  engineTimeHrs: number;
  utilPct: string;
}

export interface DriverMetrics {
  driverId: number;
  driverName: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
  totalFuelGal: number;
  drivingFuelGal: number;
  driveTimeHrs: number;
  engineTimeHrs: number;
  utilPct: string;
}

export interface FleetTotals {
  totalMiles: number;
  totalIdleFuel: number;
  totalDrivingFuel: number;
  totalFuel: number;
  totalIdleTime: number;
  totalDrivingTime: number;
  avgMpg: string;
  idlePercentage: string;
  estimatedFuelCost: number;
  estimatedIdleFuelCost: number;
}
