'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useApiClient } from './useApiClient';
import type { RepairUnitSummary } from '@/app/app/fleet/RepairBreakdown';

// --- Shared Types ---

export type OrgSettings = {
  tracksDrivers: boolean;
  telematicsProvider: 'MOTIVE' | 'SAMSARA' | null;
  contractStartDate: string | null;
};

export type VehicleUtilization = {
  vehicleId: number;
  vehicleNumber: string | null;
  vin: string | null;
  date: string;
  totalDistance: number | null; // miles
  idleTime: number | null;      // seconds
  drivingTime: number | null;   // seconds
  totalFuel: number | null;     // gallons
  idleFuel: number | null;      // gallons
};

export type DriverUtilization = {
  driverId: number;
  driverFirstName: string | null;
  driverLastName: string | null;
  date: string;
  utilization: number | null;
  drivingTime: number | null;   // seconds
  idleTime: number | null;      // seconds
  drivingFuel: number | null;
  idleFuel: number | null;
  totalDistance?: number | null;
};

export type FleetUnit = {
  servicePlanId: string;
  repairUnitNumber: string | null;
  matchType: string;
  repairVin: string | null;
  telematicsVin: string | null;
  telematics: unknown | null;
  repair: unknown | null;
  lastSyncedAt: string | null;
};

export type FleetUnitsResponse = {
  units: FleetUnit[];
  total: number;
};

export type UnitDetailResponse = {
  servicePlan: {
    id: string;
    repairUnitNumber: string | null;
    matchType: string;
    repairVin: string | null;
    telematicsVin: string | null;
    lastSyncedAt: string | null;
  };
  unitInfo: {
    unitId: string;
    unitNumber: string | null;
    vin: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    licensePlate: string | null;
    customerId: string;
  } | null;
  telematics: {
    history: VehicleUtilization[];
    hasData: boolean;
  };
  repairs: {
    history: Array<{
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
    }>;
    hasData: boolean;
  };
};

export type RepairsResponse = {
  customer?: {
    klOrgId: string;
    customerName: string;
    contractStartDate: string;
  };
  period?: {
    from: string;
    to: string;
  };
  units: RepairUnitSummary[];
  summary: {
    unitCount: number;
    invoiceCount: number;
    lineRowCount: number;
    total: number;
    tax: number;
  };
};

// --- Query Keys ---

const keys = {
  orgSettings: (orgId: string | undefined) =>
    ['org-settings', orgId] as const,
  fleetUnits: (orgId: string | undefined) =>
    ['fleet-units', orgId] as const,
  vehicleUtilization: (orgId: string | undefined, provider: string | null) =>
    ['vehicle-utilization', orgId, provider] as const,
  driverUtilization: (orgId: string | undefined) =>
    ['driver-utilization', orgId] as const,
  repairs: (orgId: string | undefined) =>
    ['repairs', orgId] as const,
  unitDetail: (orgId: string | undefined, vin: string) =>
    ['unit-detail', orgId, vin] as const,
};

// --- Hooks ---

export function useOrgSettingsQuery() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.orgSettings(organization?.id),
    queryFn: async (): Promise<OrgSettings> => {
      const api = await getApi();
      return api.get<OrgSettings>('/org/settings');
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFleetUnitsQuery() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.fleetUnits(organization?.id),
    queryFn: async (): Promise<FleetUnitsResponse> => {
      const api = await getApi();
      return api.get<FleetUnitsResponse>('/fleet/units');
    },
    enabled: !!organization?.id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useVehicleUtilizationQuery(
  provider: 'MOTIVE' | 'SAMSARA' | null | undefined
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.vehicleUtilization(organization?.id, provider ?? null),
    queryFn: async (): Promise<VehicleUtilization[]> => {
      const api = await getApi();
      if (provider === 'MOTIVE') {
        const resp = await api.get<{ data: VehicleUtilization[] }>(
          '/telematics/motive/vehicle-utilization?pageSize=50000'
        );
        return resp.data;
      }
      if (provider === 'SAMSARA') {
        const resp = await api.get<{ data: VehicleUtilization[] }>(
          '/telematics/samsara/vehicle-stats?pageSize=50000'
        );
        return resp.data;
      }
      return [];
    },
    enabled: !!organization?.id && !!provider,
    staleTime: 2 * 60 * 1000,
  });
}

export function useDriverUtilizationQuery(enabled = true) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.driverUtilization(organization?.id),
    queryFn: async (): Promise<DriverUtilization[]> => {
      const api = await getApi();
      return api.get<DriverUtilization[]>('/telematics/motive/driver-utilization');
    },
    enabled: !!organization?.id && enabled,
    staleTime: 2 * 60 * 1000,
  });
}

export function useRepairsQuery() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.repairs(organization?.id),
    queryFn: async (): Promise<RepairsResponse> => {
      const api = await getApi();
      return api.get<RepairsResponse>('/repairs');
    },
    enabled: !!organization?.id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUnitDetailQuery(vin: string) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.unitDetail(organization?.id, vin),
    queryFn: async (): Promise<UnitDetailResponse> => {
      const api = await getApi();
      return api.get<UnitDetailResponse>(`/fleet/units/${vin}`);
    },
    enabled: !!organization?.id && !!vin,
    staleTime: 2 * 60 * 1000,
  });
}
