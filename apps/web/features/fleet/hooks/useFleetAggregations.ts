import { useMemo } from 'react';
import type { VehicleUtilization, DriverUtilization } from '@/hooks/useDataQueries';
import type { RepairUnitSummary } from '@/features/fleet/components/RepairBreakdown';
import { isDamageInvoice, isDriveUpInvoice } from '@/features/fleet/components/RepairBreakdown';
import {
  filterByDateRange,
  aggregateUnitMetrics,
  aggregateDriverMetrics,
  aggregateMonthlyMetrics,
  aggregateFleetTotals,
  aggregateFleetKpis,
} from '@/features/fleet/utils/aggregations';

interface FleetAggregationsInput {
  vehicleData: VehicleUtilization[];
  driverData: DriverUtilization[];
  repairUnits: RepairUnitSummary[];
  viewMode: 'unit' | 'driver';
  selectedId: string | number | null;
  startDate: string;
  endDate: string;
  repairStartDate: string;
  repairEndDate: string;
  selectedTableYear: number;
  fuelPricePerGallon?: number;
}

export function useFleetAggregations({
  vehicleData,
  driverData,
  repairUnits,
  viewMode,
  selectedId,
  startDate,
  endDate,
  repairStartDate,
  repairEndDate,
  selectedTableYear,
  fuelPricePerGallon,
}: FleetAggregationsInput) {
  const dateFilteredVehicleData = useMemo(
    () => filterByDateRange(vehicleData, startDate, endDate),
    [vehicleData, startDate, endDate]
  );

  const dateFilteredDriverData = useMemo(
    () => filterByDateRange(driverData, startDate, endDate),
    [driverData, startDate, endDate]
  );

  const unitMetrics = useMemo(
    () => aggregateUnitMetrics(dateFilteredVehicleData),
    [dateFilteredVehicleData]
  );

  const driverMetrics = useMemo(
    () => aggregateDriverMetrics(dateFilteredDriverData),
    [dateFilteredDriverData]
  );

  const monthlyMetrics = useMemo(
    () =>
      aggregateMonthlyMetrics({
        vehicleData: dateFilteredVehicleData,
        driverData: dateFilteredDriverData,
        allVehicleData: vehicleData,
        allDriverData: driverData,
        viewMode,
        selectedId,
        selectedTableYear,
        startDate,
        endDate,
      }),
    [dateFilteredVehicleData, dateFilteredDriverData, vehicleData, driverData, viewMode, selectedId, selectedTableYear, startDate, endDate]
  );

  const fleetTotals = useMemo(
    () =>
      aggregateFleetTotals(
        viewMode === 'unit' ? dateFilteredVehicleData : dateFilteredDriverData,
        viewMode,
        fuelPricePerGallon
      ),
    [dateFilteredVehicleData, dateFilteredDriverData, viewMode, fuelPricePerGallon]
  );

  // Totals for the Monthly Summary table — filtered to the selected year (and the
  // selected unit/driver, if any), against the full dataset (not the date-range
  // picker), matching the source/scope of the per-month rows in aggregateMonthlyMetrics.
  const monthlyTableTotals = useMemo(() => {
    const yearPrefix = `${selectedTableYear}-`;
    if (viewMode === 'unit') {
      const filtered = vehicleData.filter(
        r => r.date.startsWith(yearPrefix) && (selectedId == null || r.vin === selectedId)
      );
      return aggregateFleetTotals(filtered, 'unit', fuelPricePerGallon);
    }
    const filtered = driverData.filter(
      r => r.date.startsWith(yearPrefix) && (selectedId == null || r.driverId === selectedId)
    );
    return aggregateFleetTotals(filtered, 'driver', fuelPricePerGallon);
  }, [vehicleData, driverData, viewMode, selectedId, selectedTableYear, fuelPricePerGallon]);

  const fleetKpis = useMemo(
    () => aggregateFleetKpis(dateFilteredVehicleData, fuelPricePerGallon),
    [dateFilteredVehicleData, fuelPricePerGallon]
  );

  const repairKpis = useMemo(() => {
    let totalJobs = 0;
    let damageJobs = 0;
    let driveUpJobs = 0;
    let totalRepairSpend = 0;
    repairUnits.forEach(u => {
      const filteredInvoices = u.invoices.filter(
        inv => inv.invoiceDate >= repairStartDate && inv.invoiceDate <= repairEndDate
      );
      const jobs = new Set<string>();
      const damageJobIds = new Set<string>();
      const driveUpJobIds = new Set<string>();
      filteredInvoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        jobs.add(jobId);
        if (isDamageInvoice(inv)) damageJobIds.add(jobId);
        if (isDriveUpInvoice(inv)) driveUpJobIds.add(jobId);
        totalRepairSpend += (inv.total ?? 0);
      });
      totalJobs += jobs.size;
      damageJobs += damageJobIds.size;
      driveUpJobs += driveUpJobIds.size;
    });
    return { totalJobs, damageJobs, driveUpJobs, totalRepairSpend };
  }, [repairUnits, repairStartDate, repairEndDate]);

  const availableYears = useMemo(() => {
    // Use string-prefix extraction (timezone-safe) — `new Date(iso).getFullYear()`
    // shifts dates like "2024-01-01" into 2023 in negative-offset locales, creating
    // phantom year tabs with no rows. Also drop years whose records are all zero.
    const yearTotals = new Map<number, number>();
    const addRecord = (date: string, miles: number, fuel: number) => {
      const year = parseInt(date.substring(0, 4), 10);
      if (!Number.isFinite(year)) return;
      yearTotals.set(year, (yearTotals.get(year) || 0) + (miles || 0) + (fuel || 0));
    };
    vehicleData.forEach(r => addRecord(r.date, r.totalDistance || 0, r.totalFuel || 0));
    driverData.forEach(r => addRecord(r.date, r.totalDistance || 0, (r.drivingFuel || 0) + (r.idleFuel || 0)));
    const years = Array.from(yearTotals.entries())
      .filter(([, total]) => total > 0)
      .map(([year]) => year)
      .sort();
    if (years.length === 0) years.push(new Date().getFullYear());
    return years;
  }, [vehicleData, driverData]);

  const showYearToggle = useMemo(
    () => availableYears.length > 1,
    [availableYears]
  );

  return {
    dateFilteredVehicleData,
    unitMetrics,
    driverMetrics,
    monthlyMetrics,
    fleetTotals,
    monthlyTableTotals,
    fleetKpis,
    repairKpis,
    showYearToggle,
    availableYears,
  };
}
