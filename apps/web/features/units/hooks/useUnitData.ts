import { useMemo } from 'react';
import { useOrganization } from '@clerk/nextjs';
import {
  useUnitDetailQuery,
  useVehicleUtilizationQuery,
  useFleetUnitsQuery,
  useOrgSettingsQuery,
} from '@/hooks/useDataQueries';
import type { MonthlyMetrics } from '@/features/fleet/types';

type RepairLine = {
  revenue_detail_id: string;
  invoice_date: string;
  invoice_number: string | null;
  repair_order: string | null;
  line_code: string | null;
  parts_description: string | null;
  labor_description: string | null;
  component?: string | null;
  system?: string | null;
  line_amt: number | null;
  tax_amt: number | null;
  customer: string | null;
};

function isDamageRepairLine(line: RepairLine): boolean {
  return (
    (line.component ?? '').toLowerCase().includes('damage') ||
    (line.system ?? '').toLowerCase().includes('damage')
  );
}

export function useUnitData(vin: string, startDate?: string, endDate?: string) {
  const { organization } = useOrganization();
  const unitQuery = useUnitDetailQuery(vin);
  const orgSettingsQuery = useOrgSettingsQuery();
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery();

  const loading = unitQuery.isLoading;
  const isRefetching = unitQuery.isFetching && !unitQuery.isLoading;
  const error = (unitQuery.error as Error | null)?.message ?? null;
  const unitData = unitQuery.data;

  const unit = useMemo(() => {
    if (!unitData) return null;
    return {
      vin,
      unitNumber:
        unitData.unitInfo?.unitNumber ||
        unitData.servicePlan.repairUnitNumber ||
        vin.slice(-6),
      make: unitData.unitInfo?.make ?? null,
      model: unitData.unitInfo?.model ?? null,
      year: unitData.unitInfo?.year ?? null,
      customerName: organization?.name ?? null,
    };
  }, [unitData, vin, organization?.name]);

  // All raw records from the API — never filtered
  const rawTelematicsData = useMemo(() => unitData?.telematics.history ?? [], [unitData]);

  // Date-filtered view — used for all KPI and chart computations
  const telematicsData = useMemo(() => {
    if (!startDate && !endDate) return rawTelematicsData;
    return rawTelematicsData.filter(d => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    });
  }, [rawTelematicsData, startDate, endDate]);

  const repairLines: RepairLine[] = useMemo(() => unitData?.repairs.history ?? [], [unitData]);
  const liveStats = useMemo(() => unitData?.liveStats ?? null, [unitData]);
  const safetyEvents = useMemo(() => unitData?.safetyEvents ?? [], [unitData]);

  const repairJobs = useMemo(() => {
    const map = new Map<string, RepairLine[]>();
    repairLines.forEach(l => {
      const key = l.repair_order || l.invoice_number || l.revenue_detail_id;
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    });
    return map;
  }, [repairLines]);

  const damageJobCount = useMemo(() => {
    let count = 0;
    repairJobs.forEach(lines => { if (lines.some(l => isDamageRepairLine(l))) count++; });
    return count;
  }, [repairJobs]);

  const repairCategoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; isDamage: boolean }>();
    repairLines.forEach(l => {
      if (!l.component && !l.system) return;
      const key = `${l.component || '?'} / ${l.system || '?'}`;
      const existing = map.get(key) || { count: 0, isDamage: false };
      existing.count += 1;
      if (isDamageRepairLine(l)) existing.isDamage = true;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([category, { count, isDamage }]) => ({ category, count, isDamage }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [repairLines]);

  const displayRepairs = useMemo(() => {
    const seen = new Set<string>();
    return repairLines
      .filter(l => {
        const key = l.repair_order || l.invoice_number || l.revenue_detail_id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
  }, [repairLines]);

  const overviewSummary = useMemo(() => {
    const totalMiles = telematicsData.reduce((s, d) => s + (d.totalDistance || 0), 0);
    const totalIdleTime = telematicsData.reduce((s, d) => s + (d.idleTime || 0), 0);
    const totalFuel = telematicsData.reduce((s, d) => s + (d.totalFuel || 0), 0);
    const idleFuel = telematicsData.reduce((s, d) => s + (d.idleFuel || 0), 0);
    const avgMpg = totalFuel > 0 ? totalMiles / totalFuel : 0;
    const idleHours = totalIdleTime / 3600;
    return { totalMiles, avgMpg, idleHours, totalFuel, idleFuel };
  }, [telematicsData]);

  const monthlyMetrics = useMemo((): MonthlyMetrics[] => {
    const monthlyMap = new Map<string, {
      totalMiles: number; totalIdleTime: number; totalFuel: number;
      totalIdleFuel: number; totalDrivingTime: number;
    }>();
    telematicsData.forEach(record => {
      const monthKey = record.date.substring(0, 7);
      const existing = monthlyMap.get(monthKey) || {
        totalMiles: 0, totalIdleTime: 0, totalFuel: 0,
        totalIdleFuel: 0, totalDrivingTime: 0,
      };
      existing.totalMiles += record.totalDistance || 0;
      existing.totalIdleTime += record.idleTime || 0;
      existing.totalDrivingTime += record.drivingTime || 0;
      existing.totalFuel += record.totalFuel || 0;
      existing.totalIdleFuel += record.idleFuel || 0;
      monthlyMap.set(monthKey, existing);
    });
    return Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
        const engineOn = data.totalIdleTime + data.totalDrivingTime;
        return {
          month: monthName, monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: engineOn > 0 ? parseFloat(((data.totalIdleTime / engineOn) * 100).toFixed(2)) : 0,
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
          totalFuel: parseFloat(data.totalFuel.toFixed(2)),
          drivingFuel: parseFloat(Math.max(0, data.totalFuel - data.totalIdleFuel).toFixed(2)),
        };
      });
  }, [telematicsData]);

  // Compute all-time totals directly from raw records to avoid rounding errors
  // from the monthly aggregation step (which rounds avgMpg to 2 decimal places).
  const totals = useMemo(() => {
    let totalMiles = 0, totalFuel = 0, totalIdleFuel = 0;
    let totalIdleTimeSec = 0, totalDrivingTimeSec = 0;
    telematicsData.forEach(d => {
      totalMiles     += d.totalDistance || 0;
      totalFuel      += d.totalFuel     || 0;
      totalIdleFuel  += d.idleFuel      || 0;
      totalIdleTimeSec   += d.idleTime    || 0;
      totalDrivingTimeSec += d.drivingTime || 0;
    });
    return {
      totalMiles: Math.round(totalMiles),
      totalFuel,
      totalIdleFuel: Math.round(totalIdleFuel),
      totalIdleTime: Math.round(totalIdleTimeSec / 60),   // minutes for display
      totalIdleTimeSec,
      totalDrivingTimeSec,
    };
  }, [telematicsData]);

  const overallAvgMpg = totals.totalFuel > 0
    ? (totals.totalMiles / totals.totalFuel).toFixed(2)
    : '0.00';

  // Idle % = idle engine-on time / total engine-on time (not % of calendar day)
  const engineOnSec = totals.totalIdleTimeSec + totals.totalDrivingTimeSec;
  const overallIdlePercentage = engineOnSec > 0
    ? ((totals.totalIdleTimeSec / engineOnSec) * 100).toFixed(2)
    : '0.00';

  const fleetAvg = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return null;
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    const fleetData = vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin) && v.vin !== vin);
    if (fleetData.length === 0) return null;
    let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0;
    fleetData.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
      totalIdleTime += r.idleTime || 0;
      totalDrivingTime += r.drivingTime || 0;
    });
    const engineOn = totalIdleTime + totalDrivingTime;
    return {
      avgMpg: totalFuel > 0 ? totalMiles / totalFuel : 0,
      idlePct: engineOn > 0 ? (totalIdleTime / engineOn) * 100 : 0,
    };
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data, vin]);

  const vsFleet = useMemo(() => {
    if (!fleetAvg) return null;
    const unitMpgDiff = overviewSummary.avgMpg - fleetAvg.avgMpg;
    const unitIdlePct = parseFloat(overallIdlePercentage);
    const unitIdleDiff = unitIdlePct - fleetAvg.idlePct;
    return {
      mpg: { value: `${unitMpgDiff >= 0 ? '+' : ''}${unitMpgDiff.toFixed(2)} vs fleet avg`, positive: unitMpgDiff >= 0 },
      idlePct: { value: `${unitIdleDiff >= 0 ? '+' : ''}${unitIdleDiff.toFixed(2)}% vs fleet avg`, positive: unitIdleDiff <= 0 },
    };
  }, [fleetAvg, overviewSummary.avgMpg, overallIdlePercentage]);

  return {
    loading,
    isRefetching,
    error,
    unit,
    telematicsData,
    repairLines,
    repairJobs,
    damageJobCount,
    repairCategoryBreakdown,
    displayRepairs,
    overviewSummary,
    monthlyMetrics,
    totals,
    overallAvgMpg,
    overallIdlePercentage,
    vsFleet,
    isDamageRepairLine,
    liveStats,
    safetyEvents,
  };
}
