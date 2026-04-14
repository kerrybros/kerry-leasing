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
  buildUnitOptions,
  buildDriverOptions,
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
  telematicsSelectedUnits: string[];
  telematicsSelectedDrivers: string[];
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
  telematicsSelectedUnits,
  telematicsSelectedDrivers,
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

  const filteredVehicleData = useMemo(() => {
    if (telematicsSelectedUnits.length === 0) return dateFilteredVehicleData;
    return dateFilteredVehicleData.filter(r => r.vin && telematicsSelectedUnits.includes(r.vin));
  }, [dateFilteredVehicleData, telematicsSelectedUnits]);

  const filteredDriverData = useMemo(() => {
    if (telematicsSelectedDrivers.length === 0) return dateFilteredDriverData;
    return dateFilteredDriverData.filter(
      r => r.driverId && telematicsSelectedDrivers.includes(r.driverId.toString())
    );
  }, [dateFilteredDriverData, telematicsSelectedDrivers]);

  const unitMetrics = useMemo(
    () => aggregateUnitMetrics(filteredVehicleData),
    [filteredVehicleData]
  );

  const driverMetrics = useMemo(
    () => aggregateDriverMetrics(filteredDriverData),
    [filteredDriverData]
  );

  // allVehicle/DriverData: full dataset without date filter — used by the monthly table
  // so the table always shows complete year data regardless of the date picker selection
  const allVehicleData = useMemo(() => {
    if (telematicsSelectedUnits.length === 0) return vehicleData;
    return vehicleData.filter(r => r.vin && telematicsSelectedUnits.includes(r.vin));
  }, [vehicleData, telematicsSelectedUnits]);

  const allDriverData = useMemo(() => {
    if (telematicsSelectedDrivers.length === 0) return driverData;
    return driverData.filter(r => r.driverId && telematicsSelectedDrivers.includes(r.driverId.toString()));
  }, [driverData, telematicsSelectedDrivers]);

  const monthlyMetrics = useMemo(
    () =>
      aggregateMonthlyMetrics({
        vehicleData: filteredVehicleData,
        driverData: filteredDriverData,
        allVehicleData,
        allDriverData,
        viewMode,
        selectedId,
        selectedTableYear,
        startDate,
        endDate,
      }),
    [filteredVehicleData, filteredDriverData, allVehicleData, allDriverData, viewMode, selectedId, selectedTableYear, startDate, endDate]
  );

  const fleetTotals = useMemo(
    () =>
      aggregateFleetTotals(
        viewMode === 'unit' ? filteredVehicleData : filteredDriverData,
        viewMode,
        fuelPricePerGallon
      ),
    [filteredVehicleData, filteredDriverData, viewMode, fuelPricePerGallon]
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

  const unitOptions = useMemo(
    () => buildUnitOptions(dateFilteredVehicleData),
    [dateFilteredVehicleData]
  );

  const driverOptions = useMemo(
    () => buildDriverOptions(dateFilteredDriverData),
    [dateFilteredDriverData]
  );

  const availableYears = useMemo(() => {
    // Only show years that have actual data, not every year in the date range
    const yearSet = new Set<number>();
    vehicleData.forEach(r => yearSet.add(new Date(r.date).getFullYear()));
    driverData.forEach(r => yearSet.add(new Date(r.date).getFullYear()));
    const years = Array.from(yearSet).sort();
    // Always include the current year as a fallback
    if (years.length === 0) years.push(new Date().getFullYear());
    return years;
  }, [vehicleData, driverData]);

  const showYearToggle = useMemo(
    () => availableYears.length > 1,
    [availableYears]
  );

  return {
    dateFilteredVehicleData,
    filteredVehicleData,
    filteredDriverData,
    unitMetrics,
    driverMetrics,
    monthlyMetrics,
    fleetTotals,
    fleetKpis,
    repairKpis,
    unitOptions,
    driverOptions,
    showYearToggle,
    availableYears,
  };
}
