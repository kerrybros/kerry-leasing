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

  const monthlyMetrics = useMemo(
    () =>
      aggregateMonthlyMetrics({
        vehicleData: filteredVehicleData,
        driverData: filteredDriverData,
        viewMode,
        selectedId,
        selectedTableYear,
        startDate,
        endDate,
      }),
    [filteredVehicleData, filteredDriverData, viewMode, selectedId, selectedTableYear, startDate, endDate]
  );

  const fleetTotals = useMemo(
    () =>
      aggregateFleetTotals(
        viewMode === 'unit' ? filteredVehicleData : filteredDriverData,
        selectedTableYear,
        viewMode
      ),
    [filteredVehicleData, filteredDriverData, viewMode, selectedTableYear]
  );

  const fleetKpis = useMemo(
    () => aggregateFleetKpis(dateFilteredVehicleData),
    [dateFilteredVehicleData]
  );

  const repairKpis = useMemo(() => {
    let totalJobs = 0;
    let damageJobs = 0;
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
      });
      totalJobs += jobs.size;
      damageJobs += damageJobIds.size;
    });
    return { totalJobs, damageJobs };
  }, [repairUnits, repairStartDate, repairEndDate]);

  const unitOptions = useMemo(
    () => buildUnitOptions(dateFilteredVehicleData),
    [dateFilteredVehicleData]
  );

  const driverOptions = useMemo(
    () => buildDriverOptions(dateFilteredDriverData),
    [dateFilteredDriverData]
  );

  const showYearToggle = useMemo(
    () => new Date(endDate).getFullYear() > new Date(startDate).getFullYear(),
    [startDate, endDate]
  );

  const availableYears = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);
    return years;
  }, [startDate, endDate]);

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
