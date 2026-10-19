/**
 * motive_vehicle_utilization stores idle_time and driving_time in MINUTES
 * (syncVehicleUtilization normalizes Motive's seconds at write time).
 *
 * Every API response that carries these fields uses SECONDS for both providers
 * (unit detail, the /fleet/units list, /telematics/motive/vehicle-utilization and
 * the normalized routes): the Samsara branches convert their minute columns, and
 * the web divides by 3600 for hours. This converts a Motive row to that contract.
 *
 * motive_driver_utilization is different: it stores Motive's seconds as-is, so
 * driver rows must NOT go through this.
 */
export function motiveUtilizationRowToSeconds<
  T extends { idleTime: number | null; drivingTime: number | null },
>(row: T): T {
  return {
    ...row,
    idleTime: row.idleTime != null ? row.idleTime * 60 : null,
    drivingTime: row.drivingTime != null ? row.drivingTime * 60 : null,
  };
}
