import { useMemo } from 'react';
import {
  useOrgSettingsQuery,
  useDriverUtilizationQuery,
  useDriverScorecardQuery,
  useVehicleUtilizationQuery,
  useFleetUnitsQuery,
  type DriverUtilization,
} from '@/hooks/useDataQueries';
import { computeDriverScore } from '@/lib/driverScore';
import type { DriverRow } from '@/features/drivers/types';

export type Period = 'weekly' | 'monthly';

type DriverSums = {
  driverId: number;
  driverName: string;
  totalMiles: number;
  totalFuel: number;
  totalIdleTime: number;
  totalDrivingTime: number;
  totalIdleFuel: number;
  recordCount: number;
};

export type MonthlyDriverData = {
  driverName: string;
  months: Map<string, DriverRow>;
};

export type WeeklyDriverData = {
  driverName: string;
  weeks: Map<string, DriverRow>;
};

/** Returns the ISO date string (YYYY-MM-DD) of the Monday that starts the week containing the given date. */
function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.toISOString().split('T')[0];
}

function buildDriverSums(records: DriverUtilization[]): Map<number, DriverSums> {
  const grouped = new Map<number, DriverSums>();
  records.forEach(r => {
    if (!r.driverId) return;
    const existing = grouped.get(r.driverId) ?? {
      driverId: r.driverId,
      driverName: `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${r.driverId}`,
      totalMiles: 0, totalFuel: 0,
      totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0, recordCount: 0,
    };
    existing.totalMiles += r.totalDistance || 0;
    existing.totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
    existing.totalIdleTime += r.idleTime || 0;
    existing.totalDrivingTime += r.drivingTime || 0;
    existing.totalIdleFuel += r.idleFuel || 0;
    existing.recordCount += 1;
    grouped.set(r.driverId, existing);
  });
  return grouped;
}

function sumsToRow(sums: DriverSums, fleetAvgMpg: number | undefined, dieselPrice = 5.0): DriverRow {
  const engineOnSec = sums.totalIdleTime + sums.totalDrivingTime;
  const idlePct = engineOnSec > 0 ? (sums.totalIdleTime / engineOnSec) * 100 : 0;
  const driveTimePct = engineOnSec > 0 ? (sums.totalDrivingTime / engineOnSec) * 100 : 0;
  const avgMpg = sums.totalFuel > 0 && sums.totalMiles > 0 ? sums.totalMiles / sums.totalFuel : 0;
  const drivingFuelGal = Math.max(0, sums.totalFuel - sums.totalIdleFuel);
  const drivingFuelRatio = sums.totalFuel > 0 ? drivingFuelGal / sums.totalFuel : 1;
  const utilPct = sums.recordCount > 0 ? (engineOnSec / (sums.recordCount * 86400)) * 100 : 0;
  const score = computeDriverScore({
    idlePct,
    mpg: avgMpg,
    fleetAvgMpg,
    driveTimePct,
    drivingFuelRatio,
    safetyViolations: 0,
  });
  return {
    driverId: sums.driverId,
    driverName: sums.driverName,
    totalMiles: sums.totalMiles,
    avgMpg,
    idlePct,
    idleFuelGal: sums.totalIdleFuel,
    drivingFuelGal,
    totalFuelGal: sums.totalFuel,
    driveTimeHrs: Math.round((sums.totalDrivingTime / 3600) * 10) / 10,
    idleTimeHrs: Math.round((sums.totalIdleTime / 3600) * 10) / 10,
    engineTimeHrs: Math.round((engineOnSec / 3600) * 10) / 10,
    utilPct,
    estimatedFuelCost: Math.round(sums.totalFuel * dieselPrice),
    safetyViolations: 0,
    hardEvents: 0,
    score,
  };
}

export function useDriversData(startDate: string, endDate: string, scorecardEnabled = true) {
  const orgSettingsQuery = useOrgSettingsQuery();
  const orgSettings = orgSettingsQuery.data;
  const dieselPrice = orgSettings?.dieselPricePerGallon ?? 5.0;

  const isMotive = orgSettings?.telematicsProvider === 'MOTIVE';
  const tracksDrivers = orgSettings?.tracksDrivers === true;
  const canShow = isMotive && tracksDrivers;

  const driverUtilQuery = useDriverUtilizationQuery(canShow);
  const scorecardQuery = useDriverScorecardQuery(canShow && scorecardEnabled, startDate, endDate);
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery();

  const fleetAvgMpg = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return undefined;
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    const data = vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
    let totalMiles = 0, totalFuel = 0;
    data.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
    });
    return totalFuel > 0 ? totalMiles / totalFuel : undefined;
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  // Filter records to the selected date range.
  // Use substring(0, 10) so both date-only and ISO timestamp formats work correctly.
  const periodRecords = useMemo(() => {
    if (!driverUtilQuery.data) return [];
    return driverUtilQuery.data.filter(r => {
      const d = r.date.substring(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [driverUtilQuery.data, startDate, endDate]);

  // Scorecard rows: aggregated over the selected period, sorted by score desc
  // Hard events are merged from the scorecard API (Motive-only) when available
  const driverRows = useMemo((): DriverRow[] => {
    const grouped = buildDriverSums(periodRecords);
    const hardEventsMap = new Map<number, number>();
    scorecardQuery.data?.data.forEach(d => hardEventsMap.set(d.driverId, d.hardEvents ?? 0));
    return Array.from(grouped.values())
      .map(sums => {
        const row = sumsToRow(sums, fleetAvgMpg, dieselPrice);
        row.hardEvents = hardEventsMap.get(sums.driverId) ?? 0;
        return row;
      })
      .sort((a, b) => b.score - a.score);
  }, [periodRecords, fleetAvgMpg, scorecardQuery.data]);

  // Last 12 calendar months (oldest → newest) for the MoM view
  const months = useMemo(() => {
    const now = new Date();
    const result: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }, []);

  // Last 16 Mon–Sun work weeks (oldest → newest) for the WoW view
  const weeks = useMemo(() => {
    const now = new Date();
    const daysSinceMonday = (now.getDay() + 6) % 7;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - daysSinceMonday);
    return Array.from({ length: 16 }, (_, i) => {
      const weekStart = new Date(currentMonday);
      weekStart.setDate(currentMonday.getDate() - (15 - i) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return weekStart.toISOString().split('T')[0];
    });
  }, []);

  // Weekly breakdown for the WoW view (uses all raw data, no period filter)
  const weeklyByDriver = useMemo((): Map<number, WeeklyDriverData> => {
    if (!driverUtilQuery.data) return new Map();
    const weekSet = new Set(weeks);

    const byDriverWeek = new Map<number, Map<string, DriverSums>>();
    const driverNames = new Map<number, string>();

    driverUtilQuery.data.forEach(r => {
      if (!r.driverId) return;
      const name = `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${r.driverId}`;
      if (!driverNames.has(r.driverId)) driverNames.set(r.driverId, name);

      const weekKey = getMondayKey(r.date);
      if (!weekSet.has(weekKey)) return;

      if (!byDriverWeek.has(r.driverId)) byDriverWeek.set(r.driverId, new Map());
      const weekMap = byDriverWeek.get(r.driverId)!;
      const existing = weekMap.get(weekKey) ?? {
        driverId: r.driverId,
        driverName: name,
        totalMiles: 0, totalFuel: 0,
        totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0, recordCount: 0,
      };
      existing.totalMiles += r.totalDistance || 0;
      existing.totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
      existing.totalIdleTime += r.idleTime || 0;
      existing.totalDrivingTime += r.drivingTime || 0;
      existing.totalIdleFuel += r.idleFuel || 0;
      existing.recordCount += 1;
      weekMap.set(weekKey, existing);
    });

    const result = new Map<number, WeeklyDriverData>();
    byDriverWeek.forEach((weekMap, driverId) => {
      const driverName = driverNames.get(driverId) || `Driver ${driverId}`;
      const weekRows = new Map<string, DriverRow>();
      weekMap.forEach((sums, weekKey) => {
        weekRows.set(weekKey, sumsToRow(sums, fleetAvgMpg, dieselPrice));
      });
      result.set(driverId, { driverName, weeks: weekRows });
    });
    return result;
  }, [driverUtilQuery.data, weeks, fleetAvgMpg]);

  // Monthly breakdown for the MoM view (uses all raw data, no period filter)
  const monthlyByDriver = useMemo((): Map<number, MonthlyDriverData> => {
    if (!driverUtilQuery.data) return new Map();
    const monthSet = new Set(months);

    const byDriverMonth = new Map<number, Map<string, DriverSums>>();
    const driverNames = new Map<number, string>();

    driverUtilQuery.data.forEach(r => {
      if (!r.driverId) return;
      const name = `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${r.driverId}`;
      if (!driverNames.has(r.driverId)) driverNames.set(r.driverId, name);

      const monthKey = r.date.substring(0, 7);
      if (!monthSet.has(monthKey)) return;

      if (!byDriverMonth.has(r.driverId)) byDriverMonth.set(r.driverId, new Map());
      const monthMap = byDriverMonth.get(r.driverId)!;
      const existing = monthMap.get(monthKey) ?? {
        driverId: r.driverId,
        driverName: name,
        totalMiles: 0, totalFuel: 0,
        totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0, recordCount: 0,
      };
      existing.totalMiles += r.totalDistance || 0;
      existing.totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
      existing.totalIdleTime += r.idleTime || 0;
      existing.totalDrivingTime += r.drivingTime || 0;
      existing.totalIdleFuel += r.idleFuel || 0;
      existing.recordCount += 1;
      monthMap.set(monthKey, existing);
    });

    const result = new Map<number, MonthlyDriverData>();
    byDriverMonth.forEach((monthMap, driverId) => {
      const driverName = driverNames.get(driverId) || `Driver ${driverId}`;
      const monthRows = new Map<string, DriverRow>();
      monthMap.forEach((sums, monthKey) => {
        monthRows.set(monthKey, sumsToRow(sums, fleetAvgMpg, dieselPrice));
      });
      result.set(driverId, { driverName, months: monthRows });
    });
    return result;
  }, [driverUtilQuery.data, months, fleetAvgMpg]);

  return {
    orgSettingsQuery,
    canShow,
    driverRows,
    months,
    monthlyByDriver,
    weeks,
    weeklyByDriver,
    isLoading: orgSettingsQuery.isPending || driverUtilQuery.isPending,
    isRefetching: (driverUtilQuery.isFetching || scorecardQuery.isFetching) && !driverUtilQuery.isPending,
  };
}
