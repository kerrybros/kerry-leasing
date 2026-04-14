import { useMemo } from 'react';
import {
  useOrgSettingsQuery,
  useFleetUnitsQuery,
  useVehicleUtilizationQuery,
  useDriverUtilizationQuery,
  useRepairsQuery,
} from '@/hooks/useDataQueries';
import { useFleetFilters } from './useFleetFilters';
import { useFleetAggregations } from './useFleetAggregations';

const defaultOrgSettings = {
  tracksDrivers: true,
  telematicsProvider: null as 'MOTIVE' | 'SAMSARA' | null,
  contractStartDate: null as string | null,
  dieselPricePerGallon: null as number | null,
};

export function useFleetData() {
  const filters = useFleetFilters();
  const orgSettingsQuery = useOrgSettingsQuery();
  const fleetUnitsQuery = useFleetUnitsQuery();
  const orgSettings = orgSettingsQuery.data ?? defaultOrgSettings;

  const vehicleUtilQuery = useVehicleUtilizationQuery();
  const canLoadDrivers = orgSettings.tracksDrivers && orgSettings.telematicsProvider === 'MOTIVE';
  const driverUtilQuery = useDriverUtilizationQuery(canLoadDrivers ?? false);
  const repairsQuery = useRepairsQuery();

  // Filter vehicle data to only include fleet units with a telematicsVin.
  // If no service plan units have VINs configured (e.g. new customer), show all telematics data.
  const vehicleData = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return [];
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    if (includedVins.size === 0) return vehicleUtilQuery.data;
    return vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  const driverData = useMemo(() => driverUtilQuery.data ?? [], [driverUtilQuery.data]);
  const repairUnits = useMemo(() => repairsQuery.data?.units ?? [], [repairsQuery.data]);

  const aggregations = useFleetAggregations({
    vehicleData,
    driverData,
    repairUnits,
    viewMode: filters.viewMode,
    selectedId: filters.selectedId,
    startDate: filters.startDate,
    endDate: filters.endDate,
    repairStartDate: filters.startDate,
    repairEndDate: filters.endDate,
    telematicsSelectedUnits: filters.telematicsSelectedUnits,
    telematicsSelectedDrivers: filters.telematicsSelectedDrivers,
    selectedTableYear: filters.selectedTableYear,
    fuelPricePerGallon: orgSettings.dieselPricePerGallon ?? undefined,
  });

  const telematicsLoading =
    orgSettingsQuery.isLoading ||
    fleetUnitsQuery.isLoading ||
    vehicleUtilQuery.isLoading ||
    // Keep skeleton when re-fetching but stale cached data yields nothing to show.
    // Prevents "No data available" flash when cache is stale or cross-org.
    (vehicleUtilQuery.isFetching && vehicleData.length === 0);

  const repairsLoading = repairsQuery.isLoading;
  const repairsError = (repairsQuery.error as Error | null)?.message || null;
  const orgSettingsError = filters.orgErrorDismissed
    ? null
    : (orgSettingsQuery.error as Error | null)?.message ?? null;

  const isRefetching =
    (vehicleUtilQuery.isFetching || repairsQuery.isFetching) &&
    !telematicsLoading &&
    !repairsLoading;

  return {
    ...filters,
    ...aggregations,
    orgSettings,
    repairUnits,
    telematicsLoading,
    repairsLoading,
    isRefetching,
    repairsError,
    orgSettingsError,
    fleetUnitsData: fleetUnitsQuery.data,
    vehicleUtilData: vehicleUtilQuery.data,
  };
}
