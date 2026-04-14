export interface DriverRow {
  driverId: number;
  driverName: string;
  totalMiles: number;
  avgMpg: number;
  idlePct: number;
  idleFuelGal: number;
  drivingFuelGal: number;
  totalFuelGal: number;
  driveTimeHrs: number;
  idleTimeHrs: number;
  engineTimeHrs: number;
  estimatedFuelCost: number;
  safetyViolations: number;
  hardEvents: number;
  score: number;
}
