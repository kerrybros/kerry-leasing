/**
 * Pure aggregation and filtering functions for fleet telematics data.
 * No React — safe to use in hooks, tests, and server utilities.
 */

import type { VehicleUtilization, DriverUtilization } from '@/hooks/useDataQueries';
import type { UnitMetrics, DriverMetrics, MonthlyMetrics, FleetTotals } from '@/features/fleet/types';

export const FUEL_PRICE_PER_GALLON = 3.85; // fallback if EIA price not available

// ---------------------------------------------------------------------------
// Date filtering
// ---------------------------------------------------------------------------

export function filterByDateRange<T extends { date: string }>(
  data: T[],
  start: string,
  end: string
): T[] {
  return data.filter(r => r.date >= start && r.date <= end);
}

// ---------------------------------------------------------------------------
// Unit aggregation
// ---------------------------------------------------------------------------

export function aggregateUnitMetrics(data: VehicleUtilization[]): UnitMetrics[] {
  const grouped = new Map<string, {
    vin: string; unitNumber: string; totalMiles: number;
    totalIdleTime: number; totalDrivingTime: number;
    totalFuel: number; totalIdleFuel: number;
  }>();

  data.forEach(record => {
    if (!record.vin) return;
    const existing = grouped.get(record.vin) || {
      vin: record.vin,
      unitNumber: record.vehicleNumber || record.vin.slice(-6),
      totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0,
      totalFuel: 0, totalIdleFuel: 0,
    };
    existing.totalMiles += record.totalDistance || 0;
    existing.totalIdleTime += record.idleTime || 0;
    existing.totalDrivingTime += record.drivingTime || 0;
    existing.totalFuel += record.totalFuel || 0;
    existing.totalIdleFuel += record.idleFuel || 0;
    grouped.set(record.vin, existing);
  });

  return Array.from(grouped.values()).map(unit => {
    const engineOn = unit.totalIdleTime + unit.totalDrivingTime;
    const idlePct = engineOn > 0 ? (unit.totalIdleTime / engineOn) * 100 : 0;
    const drivingFuelGal = Math.max(0, unit.totalFuel - unit.totalIdleFuel);
    return {
      vin: unit.vin,
      unitNumber: unit.unitNumber,
      totalMiles: unit.totalMiles,
      avgMpg: unit.totalFuel > 0 ? (unit.totalMiles / unit.totalFuel).toFixed(2) : '0.00',
      idlePercentage: idlePct.toFixed(2),
      idleFuel: Math.round(unit.totalIdleFuel),
      idleTimeMinutes: Math.round(unit.totalIdleTime / 60),
      totalFuelGal: Math.round(unit.totalFuel),
      drivingFuelGal: Math.round(drivingFuelGal),
      driveTimeHrs: Math.round((unit.totalDrivingTime / 3600) * 10) / 10,
      engineTimeHrs: Math.round((engineOn / 3600) * 10) / 10,
    };
  });
}

// ---------------------------------------------------------------------------
// Driver aggregation
// ---------------------------------------------------------------------------

export function aggregateDriverMetrics(data: DriverUtilization[]): DriverMetrics[] {
  const grouped = new Map<number, {
    driverId: number; driverName: string; totalMiles: number;
    totalIdleTime: number; totalDrivingTime: number;
    totalFuel: number; totalIdleFuel: number;
  }>();

  data.forEach(record => {
    if (!record.driverId) return;
    const existing = grouped.get(record.driverId) || {
      driverId: record.driverId,
      driverName: `${record.driverFirstName || ''} ${record.driverLastName || ''}`.trim() || `Driver ${record.driverId}`,
      totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0,
      totalFuel: 0, totalIdleFuel: 0,
    };
    existing.totalMiles += record.totalDistance || 0;
    existing.totalIdleTime += record.idleTime || 0;
    existing.totalDrivingTime += record.drivingTime || 0;
    existing.totalFuel += (record.drivingFuel || 0) + (record.idleFuel || 0);
    existing.totalIdleFuel += record.idleFuel || 0;
    grouped.set(record.driverId, existing);
  });

  return Array.from(grouped.values()).map(driver => {
    const engineOn = driver.totalIdleTime + driver.totalDrivingTime;
    const idlePct = engineOn > 0 ? (driver.totalIdleTime / engineOn) * 100 : 0;
    const drivingFuelGal = Math.max(0, driver.totalFuel - driver.totalIdleFuel);
    return {
      driverId: driver.driverId,
      driverName: driver.driverName,
      totalMiles: driver.totalMiles,
      avgMpg:
        driver.totalFuel > 0 && driver.totalMiles > 0
          ? (driver.totalMiles / driver.totalFuel).toFixed(2)
          : '0.00',
      idlePercentage: idlePct.toFixed(2),
      idleFuel: Math.round(driver.totalIdleFuel),
      idleTimeMinutes: Math.round(driver.totalIdleTime / 60),
      totalFuelGal: Math.round(driver.totalFuel),
      drivingFuelGal: Math.round(drivingFuelGal),
      driveTimeHrs: Math.round((driver.totalDrivingTime / 3600) * 10) / 10,
      engineTimeHrs: Math.round((engineOn / 3600) * 10) / 10,
    };
  });
}

// ---------------------------------------------------------------------------
// Monthly aggregation (chart + table data)
// ---------------------------------------------------------------------------

// Returns true when the date range is 31 days or fewer → use daily granularity
export function isDailyGranularity(startDate: string, endDate: string): boolean {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return ms <= 31 * 24 * 60 * 60 * 1000;
}

type MonthlyAggInput = {
  vehicleData: VehicleUtilization[];       // date-filtered — for the chart
  driverData: DriverUtilization[];         // date-filtered — for the chart
  allVehicleData: VehicleUtilization[];    // full dataset — for the monthly table
  allDriverData: DriverUtilization[];      // full dataset — for the monthly table
  viewMode: 'unit' | 'driver';
  selectedId: string | number | null;
  selectedTableYear: number;
  startDate: string;
  endDate: string;
};

export function aggregateMonthlyMetrics({
  vehicleData,
  driverData,
  allVehicleData,
  allDriverData,
  viewMode,
  selectedId,
  selectedTableYear,
  startDate,
  endDate,
}: MonthlyAggInput): { chartData: MonthlyMetrics[]; tableData: MonthlyMetrics[] } {
  const useDaily = isDailyGranularity(startDate, endDate);

  // Key is either YYYY-MM-DD (daily) or YYYY-MM (monthly)
  const bucketMap = new Map<string, {
    totalMiles: number; totalIdleTime: number; totalDrivingTime: number;
    totalFuel: number; totalIdleFuel: number;
  }>();

  // Chart source: date-filtered data
  let sourceData: (VehicleUtilization | DriverUtilization)[] =
    viewMode === 'unit' ? vehicleData : driverData;

  if (selectedId) {
    if (viewMode === 'unit') {
      sourceData = (vehicleData as VehicleUtilization[]).filter(r => r.vin === selectedId);
    } else {
      sourceData = (driverData as DriverUtilization[]).filter(r => r.driverId === selectedId);
    }
  }

  // Table source: full unfiltered-by-date data (respects unit/driver selection only)
  let tableSourceData: (VehicleUtilization | DriverUtilization)[] =
    viewMode === 'unit' ? allVehicleData : allDriverData;

  if (selectedId) {
    if (viewMode === 'unit') {
      tableSourceData = (allVehicleData as VehicleUtilization[]).filter(r => r.vin === selectedId);
    } else {
      tableSourceData = (allDriverData as DriverUtilization[]).filter(r => r.driverId === selectedId);
    }
  }

  // Monthly map for the table — built from full data, not date-filtered
  const monthlyMap = new Map<string, {
    totalMiles: number; totalIdleTime: number; totalDrivingTime: number;
    totalFuel: number; totalIdleFuel: number;
  }>();

  const accumulate = (
    map: Map<string, { totalMiles: number; totalIdleTime: number; totalDrivingTime: number; totalFuel: number; totalIdleFuel: number }>,
    key: string,
    record: VehicleUtilization | DriverUtilization
  ) => {
    const existing = map.get(key) || { totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0, totalFuel: 0, totalIdleFuel: 0 };
    existing.totalMiles += record.totalDistance || 0;
    existing.totalIdleTime += record.idleTime || 0;
    existing.totalIdleFuel += record.idleFuel || 0;
    if (viewMode === 'unit') {
      existing.totalDrivingTime += (record as VehicleUtilization).drivingTime || 0;
      existing.totalFuel += (record as VehicleUtilization).totalFuel || 0;
    } else {
      existing.totalDrivingTime += (record as DriverUtilization).drivingTime || 0;
      existing.totalFuel += ((record as DriverUtilization).drivingFuel || 0) + ((record as DriverUtilization).idleFuel || 0);
    }
    map.set(key, existing);
  };

  // Chart: date-filtered data → bucketMap (daily or monthly keys)
  sourceData.forEach(record => {
    const bucketKey = useDaily ? record.date : record.date.substring(0, 7);
    accumulate(bucketMap, bucketKey, record);
  });

  // Table: full unfiltered data → monthlyMap (always monthly keys)
  tableSourceData.forEach(record => {
    accumulate(monthlyMap, record.date.substring(0, 7), record);
  });

  const idlePct = (d: { totalIdleTime: number; totalDrivingTime: number }) => {
    const engineOn = d.totalIdleTime + d.totalDrivingTime;
    return engineOn > 0 ? (d.totalIdleTime / engineOn) * 100 : 0;
  };

  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();
  const multiYear = startYear !== endYear;

  const chartData: MonthlyMetrics[] = Array.from(bucketMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, data]) => {
      let label: string;
      if (useDaily) {
        // key is YYYY-MM-DD → label as "Apr 1"
        const d = new Date(key + 'T00:00:00');
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        const [year, month] = key.split('-');
        const shortMonth = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'short' });
        label = multiYear ? `${shortMonth} '${year.slice(2)}` : shortMonth;
      }
      return {
        month: label, monthKey: key,
        totalMiles: Math.round(data.totalMiles),
        avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
        idlePercentage: parseFloat(idlePct(data).toFixed(2)),
        idleFuel: Math.round(data.totalIdleFuel),
        idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        totalFuel: Math.round(data.totalFuel),
        drivingFuel: Math.round(data.totalFuel - data.totalIdleFuel),
      };
    });

  const getMonthName = (i: number) =>
    new Date(2000, i, 1).toLocaleString('default', { month: 'long' });

  const tableData: MonthlyMetrics[] = Array.from({ length: 12 }, (_, i) => {
    const monthKey = `${selectedTableYear}-${String(i + 1).padStart(2, '0')}`;
    const data = monthlyMap.get(monthKey);
    if (data) {
      return {
        month: getMonthName(i), monthKey,
        totalMiles: Math.round(data.totalMiles),
        avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
        idlePercentage: parseFloat(idlePct(data).toFixed(2)),
        idleFuel: Math.round(data.totalIdleFuel),
        idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        totalFuel: Math.round(data.totalFuel),
        drivingFuel: Math.round(data.totalFuel - data.totalIdleFuel),
      };
    }
    return { month: getMonthName(i), monthKey, totalMiles: 0, avgMpg: 0, idlePercentage: 0, idleFuel: 0, idleTimeMinutes: 0, totalFuel: 0, drivingFuel: 0 };
  });

  return { chartData, tableData };
}

// ---------------------------------------------------------------------------
// Fleet totals (for a specific year)
// ---------------------------------------------------------------------------

export function aggregateFleetTotals(
  data: (VehicleUtilization | DriverUtilization)[],
  viewMode: 'unit' | 'driver',
  fuelPricePerGallon = FUEL_PRICE_PER_GALLON
): FleetTotals {
  let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0, totalIdleFuel = 0, totalDrivingFuel = 0;

  data.forEach(r => {
    totalMiles += r.totalDistance || 0;
    totalIdleTime += r.idleTime || 0;
    totalIdleFuel += r.idleFuel || 0;
    if (viewMode === 'unit') {
      totalDrivingTime += (r as VehicleUtilization).drivingTime || 0;
      totalFuel += (r as VehicleUtilization).totalFuel || 0;
      totalDrivingFuel += (r as VehicleUtilization).drivingFuel || 0;
    } else {
      totalDrivingTime += (r as DriverUtilization).drivingTime || 0;
      const df = (r as DriverUtilization).drivingFuel || 0;
      const idf = (r as DriverUtilization).idleFuel || 0;
      totalFuel += df + idf;
      totalDrivingFuel += df;
    }
  });

  const engineOn = totalIdleTime + totalDrivingTime;
  const idlePct = engineOn > 0 ? (totalIdleTime / engineOn) * 100 : 0;
  return {
    totalMiles,
    totalIdleFuel,
    totalDrivingFuel,
    totalFuel,
    totalIdleTime: Math.round(totalIdleTime / 60),
    totalDrivingTime: Math.round(totalDrivingTime / 60),
    avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '0.00',
    idlePercentage: idlePct.toFixed(2),
    estimatedFuelCost: Math.round(totalFuel * fuelPricePerGallon),
    estimatedIdleFuelCost: Math.round(totalIdleFuel * fuelPricePerGallon),
  };
}

// ---------------------------------------------------------------------------
// Unit option generation (for MultiSelect)
// ---------------------------------------------------------------------------

export function buildUnitOptions(data: VehicleUtilization[]): { label: string; value: string }[] {
  const unique = new Set<string>();
  const opts: { label: string; value: string }[] = [];
  data.forEach(v => {
    if (v.vin && !unique.has(v.vin)) {
      unique.add(v.vin);
      opts.push({ label: v.vehicleNumber || v.vin.slice(-6), value: v.vin });
    }
  });
  return opts.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildDriverOptions(data: DriverUtilization[]): { label: string; value: string }[] {
  const unique = new Set<number>();
  const opts: { label: string; value: string }[] = [];
  data.forEach(d => {
    if (d.driverId && !unique.has(d.driverId)) {
      unique.add(d.driverId);
      const name = `${d.driverFirstName || ''} ${d.driverLastName || ''}`.trim() || `Driver ${d.driverId}`;
      opts.push({ label: name, value: d.driverId.toString() });
    }
  });
  return opts.sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Fleet KPI summary (for KPI bar)
// ---------------------------------------------------------------------------

export function aggregateFleetKpis(data: VehicleUtilization[], fuelPricePerGallon = FUEL_PRICE_PER_GALLON) {
  let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0, totalIdleFuel = 0, totalDrivingFuel = 0;
  data.forEach(r => {
    totalMiles += r.totalDistance || 0;
    totalFuel += r.totalFuel || 0;
    totalIdleTime += r.idleTime || 0;
    totalDrivingTime += r.drivingTime || 0;
    totalIdleFuel += r.idleFuel || 0;
    totalDrivingFuel += r.drivingFuel || 0;
  });
  const engineOn = totalIdleTime + totalDrivingTime;
  const idlePct = engineOn > 0 ? (totalIdleTime / engineOn) * 100 : 0;
  return {
    totalMiles: Math.round(totalMiles),
    avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '—',
    idlePct: idlePct.toFixed(1),
    idleFuel: Math.round(totalIdleFuel),
    totalFuel: Math.round(totalFuel),
    drivingFuel: Math.round(totalDrivingFuel),
    estimatedFuelCost: Math.round(totalFuel * fuelPricePerGallon),
    estimatedIdleFuelCost: Math.round(totalIdleFuel * fuelPricePerGallon),
  };
}
