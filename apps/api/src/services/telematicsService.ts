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

// Normalized types live in telematics/interfaces — imported and re-exported
// here for backwards compatibility with existing route imports.
export type {
  NormalizedVehicleRecord,
  NormalizedVehicleResponse,
  NormalizedDriverRecord,
  NormalizedDriverResponse,
} from '../telematics/interfaces/index.js';

import type {
  NormalizedVehicleRecord,
  NormalizedVehicleResponse,
  NormalizedDriverRecord,
  NormalizedDriverResponse,
} from '../telematics/interfaces/index.js';

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
      // DB stores time in minutes (converted at sync). Normalize to seconds for the
      // unified API contract — the frontend and aggregation layer both expect seconds.
      const idleTime = r.idleTime != null ? r.idleTime * 60 : null;
      const drivingTime = r.drivingTime != null ? r.drivingTime * 60 : null;
      return {
        vehicleId: r.vehicleId ?? 0,
        vehicleNumber: r.vehicleNumber ?? null,
        vin: r.vin ?? null,
        date: r.date,
        totalDistance: r.totalDistance ?? null,
        idleTime,
        drivingTime,
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

    const rows = await appPrisma.motiveDriverUtilization.findMany({
      where: {
        clerkOrgId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ date: 'desc' }, { driverId: 'asc' }],
    });

    if (rows.length === 0) return [];

    // Compute per-(driverId, date) distance by summing driving_periods.distance.
    // The distance field is stored as a human-readable string ("0.1 mi"). parseFloat()
    // correctly extracts the numeric portion in JavaScript ("0.1 mi" → 0.1).
    // This is the authoritative distance source — v2/driver_utilization has no distance field.
    const dates = [...new Set(rows.map((r: any) => r.date as string))];
    const periods = await appPrisma.motiveDrivingPeriod.findMany({
      where: {
        clerkOrgId: orgId,
        date: { in: dates },
        driverId: { not: null },
      },
      select: { driverId: true, date: true, distance: true },
    });

    const distMap = new Map<string, number>(); // key: `${driverId}:${date}`
    for (const p of periods) {
      if (p.driverId == null || !p.distance) continue;
      const distMi = parseFloat(p.distance) || 0;
      const key = `${p.driverId}:${p.date}`;
      distMap.set(key, (distMap.get(key) ?? 0) + distMi);
    }

    // Driver utilization time values are stored in seconds (raw from API — no conversion
    // applied in syncDriverUtilization). Return as-is; the frontend contract expects seconds.
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
      totalDistance: distMap.get(`${r.driverId}:${r.date}`) ?? null,
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

    // Read from normalized samsara_vehicle_utilization table.
    // All units are pre-converted at write time: gallons, miles, minutes.
    const rows = await appPrisma.samsaraVehicleUtilization.findMany({
      where: {
        clerkOrgId: orgId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
    });

    return rows.map((r) => {
      const drivingFuel =
        r.fuelGallons != null && r.idleFuelGallons != null
          ? Math.max(0, r.fuelGallons - r.idleFuelGallons)
          : r.fuelGallons ?? null;

      // DB stores time in minutes (converted at sync). Normalize to seconds for the
      // unified API contract — the frontend and aggregation layer both expect seconds.
      return {
        vehicleId: parseInt(r.vehicleId) || 0,
        vehicleNumber: r.vehicleName ?? null,
        vin: r.vin ?? null,
        date: r.date,
        totalDistance: r.distanceMiles ?? null,
        idleTime: r.idleMinutes != null ? Math.round(r.idleMinutes * 60) : null,
        drivingTime: r.drivingMinutes != null ? Math.round(r.drivingMinutes * 60) : null,
        totalFuel: r.fuelGallons ?? null,
        idleFuel: r.idleFuelGallons ?? null,
        drivingFuel,
      };
    });
  }

  private async getSamsaraDriverUtilization(
    _orgId: string,
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedDriverRecord[]> {
    // TODO: Samsara driver utilization table not yet defined in schema.
    return [];
  }

  // ---------------------------------------------------------------------------
  // Public: Driver Scorecard (Motive only — Samsara lacks per-driver data)
  // ---------------------------------------------------------------------------

  /**
   * Computes a fleet-wide driver scorecard for the given org and date range.
   * Aggregates driver utilization + scorecard safety events, applies the
   * weighted scoring formula, and returns a ranked list.
   *
   * Weights: Idle% (30%) + MPG (25%) + Safety (20%) + Utilization (15%) + Fuel Economy (10%)
   */
  async getDriverScorecard(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<DriverScorecardResponse> {
    const provider = await this.resolveProvider(orgId);
    if (provider !== TelematicsProvider.MOTIVE) {
      return { data: [], provider: provider ?? null, fleetAvgMpg: 0, period: { startDate, endDate } };
    }

    const appPrisma = getAppPrisma();

    // 1. Driver utilization records for the period
    const driverRows = await appPrisma.motiveDriverUtilization.findMany({
      where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate } },
    });

    if (driverRows.length === 0) {
      return { data: [], provider: 'MOTIVE', fleetAvgMpg: 0, period: { startDate, endDate } };
    }

    // 2. Mileage from driving periods (authoritative distance source for Motive)
    const dates = [...new Set(driverRows.map((r: any) => r.date as string))];
    const periods = await appPrisma.motiveDrivingPeriod.findMany({
      where: { clerkOrgId: orgId, date: { in: dates }, driverId: { not: null } },
      select: { driverId: true, date: true, distance: true },
    });
    const distMap = new Map<string, number>();
    for (const p of periods) {
      if (p.driverId == null || !p.distance) continue;
      const key = `${p.driverId}:${p.date}`;
      distMap.set(key, (distMap.get(key) ?? 0) + (parseFloat(p.distance) || 0));
    }

    // 3. Scorecard summaries for hard event counts
    const scorecards = await appPrisma.motiveScorecardSummary.findMany({
      where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate } },
      select: { driverId: true, numHardAccels: true, numHardBrakes: true, numHardCorners: true },
    });
    const hardEventsMap = new Map<number, number>();
    const hardBreakdownMap = new Map<number, { hardAccels: number; hardBrakes: number; hardCorners: number }>();
    for (const sc of scorecards) {
      if (sc.driverId == null) continue;
      const accels = sc.numHardAccels ?? 0;
      const brakes = sc.numHardBrakes ?? 0;
      const corners = sc.numHardCorners ?? 0;
      hardEventsMap.set(sc.driverId, (hardEventsMap.get(sc.driverId) ?? 0) + accels + brakes + corners);
      const prev = hardBreakdownMap.get(sc.driverId) ?? { hardAccels: 0, hardBrakes: 0, hardCorners: 0 };
      hardBreakdownMap.set(sc.driverId, {
        hardAccels: prev.hardAccels + accels,
        hardBrakes: prev.hardBrakes + brakes,
        hardCorners: prev.hardCorners + corners,
      });
    }

    // 4. Fleet-average MPG from vehicle utilization
    const vehicleRows = await appPrisma.motiveVehicleUtilization.findMany({
      where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate } },
      select: { totalDistance: true, totalFuel: true },
    });
    let fleetMiles = 0, fleetFuel = 0;
    for (const v of vehicleRows) {
      fleetMiles += (v.totalDistance as number | null) ?? 0;
      fleetFuel += (v.totalFuel as number | null) ?? 0;
    }
    const fleetAvgMpg = fleetFuel > 0 ? fleetMiles / fleetFuel : 0;

    // 5. Aggregate per driver
    const agg = new Map<number, {
      driverName: string; totalMiles: number; totalFuel: number;
      totalIdleTime: number; totalDrivingTime: number; totalIdleFuel: number;
    }>();

    for (const r of driverRows as any[]) {
      if (!r.driverId) continue;
      const ex = agg.get(r.driverId) ?? {
        driverName: `${r.driverFirstName ?? ''} ${r.driverLastName ?? ''}`.trim() || `Driver ${r.driverId}`,
        totalMiles: 0, totalFuel: 0, totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0,
      };
      ex.totalMiles += distMap.get(`${r.driverId}:${r.date}`) ?? 0;
      ex.totalFuel += (r.drivingFuel ?? 0) + (r.idleFuel ?? 0);
      ex.totalIdleTime += r.idleTime ?? 0;
      ex.totalDrivingTime += r.drivingTime ?? 0;
      ex.totalIdleFuel += r.idleFuel ?? 0;
      agg.set(r.driverId, ex);
    }

    // 6. Compute scores
    const MAX_IDLE_PCT = 50;
    const SAFETY_DECAY = 12;

    const scored: ScorecardDriver[] = Array.from(agg.entries()).map(([driverId, d]) => {
      const engineOn = d.totalIdleTime + d.totalDrivingTime;
      const idlePct = engineOn > 0 ? (d.totalIdleTime / engineOn) * 100 : 0;
      const driveTimePct = engineOn > 0 ? (d.totalDrivingTime / engineOn) * 100 : 0;
      const avgMpg = d.totalFuel > 0 && d.totalMiles > 0 ? d.totalMiles / d.totalFuel : 0;
      const drivingFuelGal = Math.max(0, d.totalFuel - d.totalIdleFuel);
      const fuelRatio = d.totalFuel > 0 ? drivingFuelGal / d.totalFuel : 1;
      const hardEvents = hardEventsMap.get(driverId) ?? 0;
      const hardEventBreakdown = hardBreakdownMap.get(driverId) ?? { hardAccels: 0, hardBrakes: 0, hardCorners: 0 };

      // Sub-scores
      const idleScore = Math.max(0, Math.min(100, (1 - idlePct / MAX_IDLE_PCT) * 100));
      const refMpg = fleetAvgMpg > 0 ? fleetAvgMpg : (avgMpg || 1);
      const mpgScore = Math.max(0, Math.min(100, (avgMpg / refMpg) * 60));
      const utilizationScore = Math.max(0, Math.min(100, driveTimePct));
      const fuelEconomyScore = Math.max(0, Math.min(100, fuelRatio * 100));
      const safetyScore = Math.max(0, 100 * Math.exp(-hardEvents / SAFETY_DECAY));

      const score = Math.round(
        idleScore * 0.30 +
        mpgScore * 0.25 +
        utilizationScore * 0.15 +
        fuelEconomyScore * 0.10 +
        safetyScore * 0.20
      );

      const grade =
        score >= 90 ? 'Excellent' :
        score >= 75 ? 'Good' :
        score >= 55 ? 'Fair' :
        score >= 35 ? 'Needs Work' : 'Poor';

      return {
        driverId,
        driverName: d.driverName,
        score,
        grade,
        totalMiles: Math.round(d.totalMiles * 100) / 100,
        avgMpg: Math.round(avgMpg * 100) / 100,
        idlePct: Math.round(idlePct * 10) / 10,
        idleFuelGal: Math.round(d.totalIdleFuel * 10) / 10,
        idleTimeMin: Math.round(d.totalIdleTime / 60),
        driveTimeHrs: Math.round((d.totalDrivingTime / 3600) * 10) / 10,
        totalFuelGal: Math.round(d.totalFuel * 10) / 10,
        drivingFuelGal: Math.round(drivingFuelGal * 10) / 10,
        hardEvents,
        hardEventBreakdown,
        subScores: {
          idle: Math.round(idleScore),
          mpg: Math.round(mpgScore),
          utilization: Math.round(utilizationScore),
          fuelEconomy: Math.round(fuelEconomyScore),
          safety: Math.round(safetyScore),
        },
      };
    });

    // 7. Rank by score descending
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((d, i) => { (d as any).rank = i + 1; });

    return { data: scored, provider: 'MOTIVE', fleetAvgMpg: Math.round(fleetAvgMpg * 100) / 100, period: { startDate, endDate } };
  }
}

// ---------------------------------------------------------------------------
// Scorecard types (backend-only)
// ---------------------------------------------------------------------------

export interface ScorecardDriver {
  driverId: number;
  driverName: string;
  rank?: number;
  score: number;
  grade: string;
  totalMiles: number;
  avgMpg: number;
  idlePct: number;
  idleFuelGal: number;
  idleTimeMin: number;
  driveTimeHrs: number;
  totalFuelGal: number;
  drivingFuelGal: number;
  hardEvents: number;
  hardEventBreakdown: { hardAccels: number; hardBrakes: number; hardCorners: number };
  subScores: { idle: number; mpg: number; utilization: number; fuelEconomy: number; safety: number };
}

export interface DriverScorecardResponse {
  data: ScorecardDriver[];
  provider: string | null;
  fleetAvgMpg: number;
  period: { startDate: string; endDate: string };
}
