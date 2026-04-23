import { useMemo } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { ALL_TYPES, formatUnitTypeList, isUnitTypeFilterActive } from '@/components/UnitTypeFilter';
import {
  useOrgSettingsQuery,
  useFleetUnitsQuery,
  useVehicleUtilizationQuery,
  useDriverUtilizationQuery,
  useRepairsQuery,
} from '@/hooks/useDataQueries';
import type { UnitType } from '@/hooks/useDataQueries';
import { useFleetFilters } from './useFleetFilters';
import { useFleetAggregations } from './useFleetAggregations';

/** Map repair book unit string to fleet unit type; undefined = not linked in service plan. */
function unitTypeForRepairLabel(
  unitNumber: string,
  map: Map<string, UnitType | null>
): UnitType | null | undefined {
  const t = unitNumber.trim();
  if (!t) return undefined;
  const key = t.toLowerCase();
  if (map.has(key)) return map.get(key) ?? null;
  const base = t.split(' - ')[0]?.trim() ?? '';
  const keyBase = base.toLowerCase();
  if (base && keyBase !== key && map.has(keyBase)) return map.get(keyBase) ?? null;
  return undefined;
}

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

  /** For telematics rows (VIN-keyed): type comes from the service-plan unit that owns the VIN. */
  const vinToUnitType = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const u of fleetUnitsQuery.data?.units ?? []) {
      if (u.telematicsVin) map.set(u.telematicsVin, u.unitType ?? null);
    }
    return map;
  }, [fleetUnitsQuery.data]);

  /** Distinct types assigned on any service plan unit (includes non-VIN units like some trailers). */
  const availableUnitTypes = useMemo((): UnitType[] => {
    const types = new Set<UnitType>();
    for (const u of fleetUnitsQuery.data?.units ?? []) {
      if (u.unitType) types.add(u.unitType);
    }
    if (types.size === 0) return [];
    return ALL_TYPES.filter(t => types.has(t));
  }, [fleetUnitsQuery.data]);

  const repairUnitNumberToUnitType = useMemo(() => {
    const m = new Map<string, UnitType | null>();
    for (const u of fleetUnitsQuery.data?.units ?? []) {
      const n = u.repairUnitNumber?.trim();
      if (!n) continue;
      m.set(n.toLowerCase(), u.unitType ?? null);
    }
    return m;
  }, [fleetUnitsQuery.data]);

  const unitTypeFilterActive = useMemo(
    () => isUnitTypeFilterActive(filters.selectedUnitTypes, availableUnitTypes),
    [filters.selectedUnitTypes, availableUnitTypes]
  );

  const unitTypeFilterDescription = useMemo(
    () => (unitTypeFilterActive ? formatUnitTypeList(filters.selectedUnitTypes) : null),
    [unitTypeFilterActive, filters.selectedUnitTypes]
  );

  // Telematics is VIN-keyed: only VINs on the service plan, then filter by that plan unit’s type.
  // If no service plan VINs, show all telematics (legacy fallback for unconfigured orgs).
  const vehicleData = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return [];
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    let data = includedVins.size === 0 ? vehicleUtilQuery.data : vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
    if (isUnitTypeFilterActive(filters.selectedUnitTypes, availableUnitTypes)) {
      data = data.filter(v => filters.selectedUnitTypes.includes((v.vin ? vinToUnitType.get(v.vin) : null) as any));
    }
    return data;
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data, filters.selectedUnitTypes, vinToUnitType, availableUnitTypes]);

  const driverData = useMemo(() => driverUtilQuery.data ?? [], [driverUtilQuery.data]);

  const repairUnitsFromApi = useMemo(() => repairsQuery.data?.units ?? [], [repairsQuery.data]);

  /** Only units on the service plan (by repair book number) appear in the customer app. */
  const repairUnitsOnServicePlan = useMemo(
    () =>
      repairUnitsFromApi.filter(ru => {
        return unitTypeForRepairLabel(ru.unitNumber, repairUnitNumberToUnitType) !== undefined;
      }),
    [repairUnitsFromApi, repairUnitNumberToUnitType]
  );

  const repairUnits = useMemo(() => {
    if (!unitTypeFilterActive) return repairUnitsOnServicePlan;
    return repairUnitsOnServicePlan.filter(ru => {
      const t = unitTypeForRepairLabel(ru.unitNumber, repairUnitNumberToUnitType);
      if (t == null) return false;
      return filters.selectedUnitTypes.includes(t);
    });
  }, [
    repairUnitsOnServicePlan,
    unitTypeFilterActive,
    repairUnitNumberToUnitType,
    filters.selectedUnitTypes,
  ]);

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
    unitTypeFilterActive,
    unitTypeFilterDescription,
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
