import { useMemo } from 'react';
import type { VehicleUtilization, DriverUtilization } from '@/hooks/useDataQueries';
import type { RepairUnitSummary } from '@/features/fleet/components/RepairBreakdown';
import { isDamageInvoice } from '@/features/fleet/components/RepairBreakdown';
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

  const fleetKpis = useMemo(
    () => aggregateFleetKpis(dateFilteredVehicleData, fuelPricePerGallon),
    [dateFilteredVehicleData, fuelPricePerGallon]
  );

  const repairKpis = useMemo(() => {
    let totalJobs = 0;
    let damageJobs = 0;
    let totalRepairSpend = 0;
    repairUnits.forEach(u => {
      const filteredInvoices = u.invoices.filter(
        inv => inv.invoiceDate >= repairStartDate && inv.invoiceDate <= repairEndDate
      );
      const jobs = new Set<string>();
      const damageJobIds = new Set<string>();
      filteredInvoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        jobs.add(jobId);
        if (isDamageInvoice(inv)) damageJobIds.add(jobId);
        totalRepairSpend += (inv.total ?? 0);
      });
      totalJobs += jobs.size;
      damageJobs += damageJobIds.size;
    });
    return { totalJobs, damageJobs, totalRepairSpend };
  }, [repairUnits, repairStartDate, repairEndDate]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    vehicleData.forEach(r => yearSet.add(new Date(r.date).getFullYear()));
    driverData.forEach(r => yearSet.add(new Date(r.date).getFullYear()));
    const years = Array.from(yearSet).sort();
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
    fleetKpis,
    repairKpis,
    showYearToggle,
    availableYears,
  };
}
