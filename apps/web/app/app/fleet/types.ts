export interface MonthlyMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuel: number;
  idleTimeMinutes: number;
}

export interface UnitMetrics {
  vin: string;
  unitNumber: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
}

export interface DriverMetrics {
  driverId: number;
  driverName: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
}

export interface FleetTotals {
  totalMiles: number;
  totalIdleFuel: number;
  totalIdleTime: number;
  avgMpg: string;
  idlePercentage: string;
}
