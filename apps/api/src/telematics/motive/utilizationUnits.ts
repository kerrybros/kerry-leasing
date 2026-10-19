/**
 * motive_vehicle_utilization stores idle_time and driving_time in MINUTES
 * (syncVehicleUtilization normalizes Motive's seconds at write time).
 *
 * The unit detail response contract is SECONDS for both providers: the Samsara
 * branch already converts its minute columns, and the web page divides by 3600
 * for hours. This converts a Motive row to that contract.
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
