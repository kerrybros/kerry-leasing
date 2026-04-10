/**
 * TELEMATICS SERVICE
 *
 * Provider-agnostic service layer for telematics data.
 * Reads the org's configured provider from the app DB and routes to the
 * correct underlying data source. The public interface returns a single
 * normalized shape regardless of provider.
 *
 * DB query stubs are marked with TODO — fill in real Prisma queries once
 * the schema is finalized.
 */

import { getAppPrisma } from '../lib/prisma.js';
import { TelematicsProvider } from '../telematics/types.js';

// ---------------------------------------------------------------------------
// Normalized response shapes (match the VehicleUtilization / DriverUtilization
// types expected by the frontend in apps/web/hooks/useDataQueries.ts)
// ---------------------------------------------------------------------------

export interface NormalizedVehicleRecord {
  vehicleId: number;
  vehicleNumber: string | null;
  vin: string | null;
  date: string; // YYYY-MM-DD
  totalDistance: number | null; // miles
  idleTime: number | null;      // seconds
  drivingTime: number | null;   // seconds
  totalFuel: number | null;     // gallons
  idleFuel: number | null;      // gallons
  drivingFuel: number | null;   // gallons
}

export interface NormalizedDriverRecord {
  driverId: number;
  driverFirstName: string | null;
  driverLastName: string | null;
  date: string; // YYYY-MM-DD
  utilization: number | null;
  drivingTime: number | null;   // seconds
  idleTime: number | null;      // seconds
  drivingFuel: number | null;
  idleFuel: number | null;
  totalDistance: number | null; // miles
}

export interface NormalizedVehicleResponse {
  data: NormalizedVehicleRecord[];
  provider: 'MOTIVE' | 'SAMSARA';
}

export interface NormalizedDriverResponse {
  data: NormalizedDriverRecord[];
  provider: 'MOTIVE' | 'SAMSARA';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TelematicsService {
  /**
   * Returns normalized vehicle utilization for the org filtered by date range.
   * Automatically routes to the correct provider DB table.
   */
  async getVehicleUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedVehicleResponse> {
    const provider = await this.resolveProvider(orgId);

    if (provider === TelematicsProvider.MOTIVE) {
      const data = await this.getMotiveVehicleUtilization(orgId, startDate, endDate);
      return { data, provider: 'MOTIVE' };
    }

    if (provider === TelematicsProvider.SAMSARA) {
      const data = await this.getSamsaraVehicleUtilization(orgId, startDate, endDate);
      return { data, provider: 'SAMSARA' };
    }

    return { data: [], provider: 'MOTIVE' };
  }

  /**
   * Returns normalized driver utilization for the org filtered by date range.
   * Automatically routes to the correct provider DB table.
   */
  async getDriverUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedDriverResponse> {
    const provider = await this.resolveProvider(orgId);

    if (provider === TelematicsProvider.MOTIVE) {
      const data = await this.getMotiveDriverUtilization(orgId, startDate, endDate);
      return { data, provider: 'MOTIVE' };
    }

    if (provider === TelematicsProvider.SAMSARA) {
      const data = await this.getSamsaraDriverUtilization(orgId, startDate, endDate);
      return { data, provider: 'SAMSARA' };
    }

    return { data: [], provider: 'MOTIVE' };
  }

  // ---------------------------------------------------------------------------
  // Private: provider resolution
  // ---------------------------------------------------------------------------

  private async resolveProvider(orgId: string): Promise<TelematicsProvider | null> {
    const appPrisma = getAppPrisma();
    const account = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId: orgId },
      select: { provider: true },
    });
    return (account?.provider as TelematicsProvider | undefined) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private: Motive data layer
  // ---------------------------------------------------------------------------

  private async getMotiveVehicleUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedVehicleRecord[]> {
    const appPrisma = getAppPrisma();

    // TODO: Replace with real Prisma query against motiveVehicleUtilization table
    // filtered by clerkOrgId + date range once schema is finalized.
    // Example:
    // const rows = await appPrisma.motiveVehicleUtilization.findMany({
    //   where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate } },
    //   orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
    // });
    // return rows.map(r => ({ ... }));

    // Stub: delegate to the existing route's DB call for now
    const rows = await appPrisma.motiveVehicleUtilization.findMany({
      where: {
        clerkOrgId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
    });

    return rows.map((r: any) => {
      const totalFuel = r.totalFuel ?? null;
      const idleFuel = r.idleFuel ?? null;
      const drivingFuel =
        totalFuel != null && idleFuel != null
          ? Math.max(0, totalFuel - idleFuel)
          : totalFuel != null
          ? totalFuel
          : null;
      return {
        vehicleId: r.vehicleId ?? 0,
        vehicleNumber: r.vehicleNumber ?? null,
        vin: r.vin ?? null,
        date: r.date,
        totalDistance: r.totalDistance ?? null,
        idleTime: r.idleTime ?? null,
        drivingTime: r.drivingTime ?? null,
        totalFuel,
        idleFuel,
        drivingFuel,
      };
    });
  }

  private async getMotiveDriverUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedDriverRecord[]> {
    const appPrisma = getAppPrisma();

    // TODO: Replace with real Prisma query against motiveDriverUtilization table
    // filtered by clerkOrgId + date range, joined with motiveDrivingPeriod for
    // totalDistance, once schema is finalized.

    const rows = await appPrisma.motiveDriverUtilization.findMany({
      where: {
        clerkOrgId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ date: 'desc' }, { driverId: 'asc' }],
    });

    return rows.map((r: any) => ({
      driverId: r.driverId ?? 0,
      driverFirstName: r.driverFirstName ?? null,
      driverLastName: r.driverLastName ?? null,
      date: r.date,
      utilization: r.utilization ?? null,
      drivingTime: r.drivingTime ?? null,
      idleTime: r.idleTime ?? null,
      drivingFuel: r.drivingFuel ?? null,
      idleFuel: r.idleFuel ?? null,
      totalDistance: null, // TODO: compute from motiveDrivingPeriod
    }));
  }

  // ---------------------------------------------------------------------------
  // Private: Samsara data layer
  // ---------------------------------------------------------------------------

  private async getSamsaraVehicleUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedVehicleRecord[]> {
    const appPrisma = getAppPrisma();

    // TODO: Replace with real Prisma query against samsaraRawData table
    // filtered by clerkOrgId + date range, with idle fuel lookup from
    // samsaraIdleEvent table, once schema is finalized.

    const rows = await appPrisma.samsaraRawData.findMany({
      where: {
        clerkOrgId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
    });

    return rows.map((r: any) => {
      const totalDistanceMiles =
        r.distanceTraveledMeters != null ? r.distanceTraveledMeters / 1609.34 : null;
      const totalFuelGallons =
        r.fuelConsumedMl != null ? r.fuelConsumedMl / 3785.41 : null;
      const engineMs = r.engineRunTimeDurationMs != null ? Number(r.engineRunTimeDurationMs) : null;
      const idleMs =
        r.engineIdleTimeDurationMs != null ? Number(r.engineIdleTimeDurationMs) : null;
      const idleSeconds = idleMs != null ? Math.round(idleMs / 1000) : null;
      const drivingSeconds =
        engineMs != null && idleMs != null
          ? Math.max(0, Math.round((engineMs - idleMs) / 1000))
          : engineMs != null
          ? Math.round(engineMs / 1000)
          : null;

      // Derive idle fuel from idle time ratio until samsaraIdleEvent aggregates are available
      const engineSeconds = engineMs != null ? engineMs / 1000 : null;
      const idleFuelGallons =
        totalFuelGallons != null && engineSeconds != null && engineSeconds > 0 && idleSeconds != null
          ? (idleSeconds / engineSeconds) * totalFuelGallons
          : null;
      const drivingFuelGallons =
        totalFuelGallons != null && idleFuelGallons != null
          ? totalFuelGallons - idleFuelGallons
          : totalFuelGallons != null
          ? totalFuelGallons
          : null;

      return {
        vehicleId: parseInt(r.vehicleId) || 0,
        vehicleNumber: r.vehicleName ?? null,
        vin: r.vin ?? null,
        date: r.date,
        totalDistance: totalDistanceMiles,
        idleTime: idleSeconds,
        drivingTime: drivingSeconds,
        totalFuel: totalFuelGallons,
        idleFuel: idleFuelGallons,
        drivingFuel: drivingFuelGallons,
      };
    });
  }

  private async getSamsaraDriverUtilization(
    _orgId: string,
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedDriverRecord[]> {
    // TODO: Samsara driver utilization table not yet defined in schema.
    // Return empty array until schema is finalized.
    return [];
  }
}
