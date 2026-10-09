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
  utilPct: number;
  estimatedFuelCost: number;
  safetyViolations: number;
  hardEvents: number;
  /**
   * Motive's OWN rolling four week safety score, exactly as Motive reports it.
   * This is the score shown to users, because the dashboard has to reconcile
   * against Motive. Null when Motive has no score for the driver.
   */
  motiveSafetyScore: number | null;
  /**
   * Our cost-led composite. Kept for internal comparisons only. It is NOT
   * displayed: it is not Motive's number and cannot be reconciled against
   * Motive, which is how it came to be mistaken for a safety score.
   */
  score: number;
}
