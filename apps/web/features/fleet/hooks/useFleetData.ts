import { useMemo } from 'react';
import { useOrganization } from '@clerk/nextjs';
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
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const hasActiveOrg = orgLoaded && !!organization;
  const noActiveOrg = orgLoaded && !organization;

  const filters = useFleetFilters();
  const orgSettingsQuery = useOrgSettingsQuery();
  const fleetUnitsQuery = useFleetUnitsQuery();
  const orgSettings = orgSettingsQuery.data ?? defaultOrgSettings;

  const vehicleUtilQuery = useVehicleUtilizationQuery();
  const canLoadDrivers = orgSettings.tracksDrivers && orgSettings.telematicsProvider === 'MOTIVE';
  const driverUtilQuery = useDriverUtilizationQuery(canLoadDrivers ?? false);
  const repairsQuery = useRepairsQuery();

  const vinToUnitType = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const u of fleetUnitsQuery.data?.units ?? []) {
      if (u.telematicsVin) map.set(u.telematicsVin, u.unitType ?? null);
    }
    return map;
  }, [fleetUnitsQuery.data]);

  const availableUnitTypes = useMemo(() => {
    const types = new Set<string>();
    for (const t of vinToUnitType.values()) {
      if (t) types.add(t);
    }
    return Array.from(types) as import('@/hooks/useDataQueries').UnitType[];
  }, [vinToUnitType]);

  // Filter vehicle data to only include fleet units with a telematicsVin.
  // If no service plan units have VINs configured (e.g. new customer), show all telematics data.
  const vehicleData = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return [];
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    let data = includedVins.size === 0 ? vehicleUtilQuery.data : vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
    if (filters.selectedUnitTypes.length > 0) {
      data = data.filter(v => filters.selectedUnitTypes.includes((v.vin ? vinToUnitType.get(v.vin) : null) as any));
    }
    return data;
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data, filters.selectedUnitTypes, vinToUnitType]);

  const vinToRepairUnitNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of fleetUnitsQuery.data?.units ?? []) {
      if (u.telematicsVin && u.repairUnitNumber) map.set(u.telematicsVin, u.repairUnitNumber);
    }
    return map;
  }, [fleetUnitsQuery.data]);

  const driverData = useMemo(() => driverUtilQuery.data ?? [], [driverUtilQuery.data]);
  const repairUnits = useMemo(() => repairsQuery.data?.units ?? [], [repairsQuery.data]);

  const earliestDataDate = useMemo(() => {
    if (vehicleData.length === 0) return undefined;
    const min = vehicleData.reduce((acc, r) => (r.date < acc ? r.date : acc), vehicleData[0].date);
    return min.substring(0, 10);
  }, [vehicleData]);

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
    selectedTableYear: filters.selectedTableYear,
    fuelPricePerGallon: orgSettings.dieselPricePerGallon ?? undefined,
  });

  // When no org is selected, all org-scoped queries are disabled; in RQ5 isPending
  // can stay true and looks like an infinite/blank page — do not show loading in that case.
  const telematicsLoading =
    hasActiveOrg &&
    (orgSettingsQuery.isPending ||
      fleetUnitsQuery.isPending ||
      vehicleUtilQuery.isPending ||
      // Keep skeleton when re-fetching but stale cached data yields nothing to show.
      (vehicleUtilQuery.isFetching && vehicleData.length === 0));

  const repairsLoading = hasActiveOrg && repairsQuery.isPending;
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
    vinToRepairUnitNumber,
    availableUnitTypes,
    orgLoaded,
    hasActiveOrg,
    noActiveOrg,
    telematicsLoading,
    repairsLoading,
    isRefetching,
    repairsError,
    orgSettingsError,
    earliestDataDate,
  };
}
