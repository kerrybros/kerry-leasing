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
import { cacheGetOrSet } from '../lib/redis.js';
import { config } from '../config.js';
import { SAFETY_EVENT_WEIGHTS, weightedEventTotal, safetyScoreFromRate, type NormalizedSafetyEvent } from './safetyScore.js';

const CACHE_TTL_SECS = 7200; // 2 hours — nightly sync invalidates anyway

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
    const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
    const key = `${env}:telematics:vehicle:${orgId}:${startDate}:${endDate}`;
    return cacheGetOrSet(key, CACHE_TTL_SECS, () =>
      this._fetchVehicleUtilization(orgId, startDate, endDate)
    );
  }

  private async _fetchVehicleUtilization(
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
    const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
    const key = `${env}:telematics:driver:${orgId}:${startDate}:${endDate}`;
    return cacheGetOrSet(key, CACHE_TTL_SECS, () =>
      this._fetchDriverUtilization(orgId, startDate, endDate)
    );
  }

  private async _fetchDriverUtilization(
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
      select: {
        vehicleId: true,
        vehicleNumber: true,
        vin: true,
        date: true,
        totalDistance: true,
        idleTime: true,
        drivingTime: true,
        totalFuel: true,
        idleFuel: true,
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
      select: {
        driverId: true,
        driverFirstName: true,
        driverLastName: true,
        date: true,
        utilization: true,
        drivingTime: true,
        idleTime: true,
        drivingFuel: true,
        idleFuel: true,
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
      select: {
        vehicleId: true,
        vehicleName: true,
        vin: true,
        date: true,
        distanceMiles: true,
        idleMinutes: true,
        drivingMinutes: true,
        fuelGallons: true,
        idleFuelGallons: true,
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
    const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
    const key = `${env}:telematics:scorecard:${orgId}:${startDate}:${endDate}`;
    return cacheGetOrSet(key, CACHE_TTL_SECS, () =>
      this._fetchDriverScorecard(orgId, startDate, endDate)
    );
  }

  /**
   * The single source of "what are this org's safety events in [start,end]".
   * Merges driver performance events + VALID speeding into one normalized
   * stream — a speeding event is just a safety event. Every safety calculation
   * (headline scorecard, SMS, MoM/WoW) goes through here, so there is exactly
   * one place that decides what counts as a safety event.
   */
  private async _fetchSafetyEvents(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedSafetyEvent[]> {
    const appPrisma = getAppPrisma();
    const [perf, speeding] = await Promise.all([
      appPrisma.motiveDriverPerformanceEvent.findMany({
        where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate }, driverId: { not: null } },
        select: { driverId: true, eventType: true, severity: true, date: true },
      }),
      // Valid speeding only — for this fleet ≈0 until Motive is configured.
      appPrisma.motiveSpeedingEvent.findMany({
        where: { clerkOrgId: orgId, date: { gte: startDate, lte: endDate }, driverId: { not: null }, status: 'valid' },
        select: { driverId: true, severity: true, date: true },
      }),
    ]);
    const out: NormalizedSafetyEvent[] = [];
    for (const e of perf) {
      if (e.driverId == null) continue;
      out.push({ driverId: Number(e.driverId), date: e.date, eventType: e.eventType, severity: e.severity });
    }
    for (const s of speeding) {
      if (s.driverId == null) continue;
      out.push({ driverId: Number(s.driverId), date: s.date, eventType: 'speeding', severity: s.severity });
    }
    return out;
  }

  private async _fetchDriverScorecard(
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
      select: {
        driverId: true,
        driverFirstName: true,
        driverLastName: true,
        date: true,
        utilization: true,
        drivingTime: true,
        idleTime: true,
        drivingFuel: true,
        idleFuel: true,
      },
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

    // 3. Unified safety-event stream for the period (perf events + valid
    // speeding, normalized to one shape — a speeding event IS a safety event).
    // Summable per-event source — NOT Motive's daily score — so the safety
    // sub-score rolls up correctly for any window. See safetyScore.ts.
    const safetyEvents = await this._fetchSafetyEvents(orgId, startDate, endDate);
    const weightedMap = new Map<number, number>();   // weighted event total per driver
    const hardEventsMap = new Map<number, number>(); // count of scored (weighted>0) events
    const hardBreakdownMap = new Map<number, Record<string, number>>(); // count by eventType
    for (const e of safetyEvents) {
      if ((SAFETY_EVENT_WEIGHTS[e.eventType] ?? 0) <= 0) continue; // excluded / non-behavioral / unknown
      weightedMap.set(e.driverId, (weightedMap.get(e.driverId) ?? 0) + weightedEventTotal([e]));
      hardEventsMap.set(e.driverId, (hardEventsMap.get(e.driverId) ?? 0) + 1);
      const bd = hardBreakdownMap.get(e.driverId) ?? {};
      bd[e.eventType] = (bd[e.eventType] ?? 0) + 1;
      hardBreakdownMap.set(e.driverId, bd);
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

    // 6. Compute scores — 3 levers, cost-led: Idle 0.40 / MPG 0.35 / Safety 0.25.
    // Utilization dropped; old "fuel economy" was a duplicate idle metric (folded
    // into Idle). Safety is per-mile, Motive-weighted (safetyScore.ts).
    const MAX_IDLE_PCT = 50;
    const W_IDLE = 0.40, W_MPG = 0.35, W_SAFETY = 0.25;

    const scored: ScorecardDriver[] = Array.from(agg.entries()).map(([driverId, d]) => {
      const engineOn = d.totalIdleTime + d.totalDrivingTime;
      const idlePct = engineOn > 0 ? (d.totalIdleTime / engineOn) * 100 : 0;
      const avgMpg = d.totalFuel > 0 && d.totalMiles > 0 ? d.totalMiles / d.totalFuel : 0;
      const drivingFuelGal = Math.max(0, d.totalFuel - d.totalIdleFuel);
      const hardEvents = hardEventsMap.get(driverId) ?? 0;
      const hardEventBreakdown = hardBreakdownMap.get(driverId) ?? {};
      const weightedEvents = weightedMap.get(driverId) ?? 0;

      // Sub-scores
      const idleScore = Math.max(0, Math.min(100, (1 - idlePct / MAX_IDLE_PCT) * 100));
      const refMpg = fleetAvgMpg > 0 ? fleetAvgMpg : (avgMpg || 1);
      const mpgScore = Math.max(0, Math.min(100, (avgMpg / refMpg) * 60));
      const safetyScore = safetyScoreFromRate(weightedEvents, d.totalMiles);

      const score = Math.round(
        idleScore * W_IDLE +
        mpgScore * W_MPG +
        safetyScore * W_SAFETY
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
          safety: Math.round(safetyScore),
        },
      };
    });

    // 7. Rank by score descending
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((d, i) => { (d as any).rank = i + 1; });

    return { data: scored, provider: 'MOTIVE', fleetAvgMpg: Math.round(fleetAvgMpg * 100) / 100, period: { startDate, endDate } };
  }

  /**
   * Per-driver safety sub-score for an arbitrary set of period windows (used by
   * the Month-over-Month / Week-over-Week trend grids so their safety is the
   * SAME per-mile, Motive-weighted metric as the headline scorecard — just
   * bucketed per period). One batched call; same helpers as the headline.
   * Returns { [periodKey]: { [driverId]: 0–100 } }.
   */
  async getDriverSafetyByPeriod(
    orgId: string,
    periods: { key: string; startDate: string; endDate: string }[]
  ): Promise<Record<string, Record<number, number>>> {
    if (periods.length === 0) return {};
    const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
    const keysSig = periods.map(p => `${p.key}:${p.startDate}:${p.endDate}`).sort().join(',');
    const cacheKey = `${env}:telematics:safetybyperiod:${orgId}:${keysSig}`;
    return cacheGetOrSet(cacheKey, CACHE_TTL_SECS, async () => {
      const provider = await this.resolveProvider(orgId);
      if (provider !== TelematicsProvider.MOTIVE) return {};
      const appPrisma = getAppPrisma();

      const minStart = periods.reduce((m, p) => (p.startDate < m ? p.startDate : m), periods[0].startDate);
      const maxEnd = periods.reduce((m, p) => (p.endDate > m ? p.endDate : m), periods[0].endDate);

      // Same unified safety-event stream as the headline scorecard (perf events
      // + valid speeding) so MoM/WoW safety stays exactly consistent.
      const [safetyEvents, drivingPeriods, utilRows] = await Promise.all([
        this._fetchSafetyEvents(orgId, minStart, maxEnd),
        appPrisma.motiveDrivingPeriod.findMany({
          where: { clerkOrgId: orgId, date: { gte: minStart, lte: maxEnd }, driverId: { not: null } },
          select: { driverId: true, date: true, distance: true },
        }),
        // Mirror the headline scorecard exactly: miles are only counted on
        // (driver, date) pairs that have a driver-utilization record.
        appPrisma.motiveDriverUtilization.findMany({
          where: { clerkOrgId: orgId, date: { gte: minStart, lte: maxEnd } },
          select: { driverId: true, date: true },
        }),
      ]);
      const utilDates = new Set(
        utilRows.filter((u: { driverId: number | null }) => u.driverId != null)
          .map((u: { driverId: number | null; date: string }) => `${u.driverId}|${u.date}`),
      );

      // Per driver → per date → { weighted events, miles }
      const byDriver = new Map<number, Map<string, { w: number; mi: number }>>();
      const bump = (did: number, date: string, w: number, mi: number) => {
        let m = byDriver.get(did);
        if (!m) { m = new Map(); byDriver.set(did, m); }
        const e = m.get(date) ?? { w: 0, mi: 0 };
        e.w += w; e.mi += mi;
        m.set(date, e);
      };
      for (const ev of safetyEvents) {
        if (!SAFETY_EVENT_WEIGHTS[ev.eventType]) continue;
        bump(ev.driverId, ev.date, weightedEventTotal([ev]), 0);
      }
      for (const p of drivingPeriods) {
        if (p.driverId == null || !p.distance) continue;
        if (!utilDates.has(`${Number(p.driverId)}|${p.date}`)) continue; // headline-consistent miles gating
        bump(Number(p.driverId), p.date, 0, parseFloat(p.distance) || 0);
      }

      const out: Record<string, Record<number, number>> = {};
      for (const per of periods) {
        const map: Record<number, number> = {};
        for (const [did, dateMap] of byDriver) {
          let w = 0, mi = 0;
          for (const [date, e] of dateMap) {
            if (date >= per.startDate && date <= per.endDate) { w += e.w; mi += e.mi; }
          }
          if (mi > 0 || w > 0) map[did] = Math.round(safetyScoreFromRate(w, mi));
        }
        out[per.key] = map;
      }
      return out;
    });
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
  hardEventBreakdown: Record<string, number>; // count keyed by Motive event_type
  subScores: { idle: number; mpg: number; safety: number };
}

export interface DriverScorecardResponse {
  data: ScorecardDriver[];
  provider: string | null;
  fleetAvgMpg: number;
  period: { startDate: string; endDate: string };
}
