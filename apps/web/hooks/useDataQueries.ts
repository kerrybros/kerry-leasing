'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useApiClient } from './useApiClient';
import type { RepairUnitSummary } from '@/features/fleet/components/RepairBreakdown';

// --- Shared Types ---

export type BrandColorPreset =
  | 'KERRY_GOLD' | 'ROYAL_BLUE' | 'NAVY' | 'TEAL' | 'FOREST'
  | 'BURGUNDY' | 'AMBER' | 'VIOLET' | 'SLATE_BRAND' | 'COPPER';

export type OrgSettings = {
  tracksDrivers: boolean;
  telematicsProvider: 'MOTIVE' | 'SAMSARA' | null;
  contractStartDate: string | null;
  serviceRequestUrl: string | null;
  contractTermYears: number | null;
  telematicsDashboardUrl: string | null;
  telematicsDashboardUsername: string | null;
  telematicsDashboardPassword: string | null;
  brandColorPreset: BrandColorPreset | null;
  dieselPricePerGallon: number | null;
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
  drivingFuel: number | null;   // gallons
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
  unitType: UnitType | null;
  telematics: unknown | null;
  repair: unknown | null;
  lastSyncedAt: string | null;
};

export type FleetUnitsResponse = {
  units: FleetUnit[];
  total: number;
};

export type SafetyEvent = {
  samsaraId: string;
  behaviorLabel: string;
  severity: string | null;
  maxValue: number | null;
  time: string;
  eventDate: string;
  driverName: string | null;
  lat: number | null;
  lon: number | null;
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
  liveStats: {
    odometerMiles: number | null;
    engineHours: number | null;
    capturedAt: string | null;
  } | null;
  telematics: {
    history: VehicleUtilization[];
    hasData: boolean;
  };
  safetyEvents: SafetyEvent[];
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

export type ScorecardDriver = {
  driverId: number;
  driverName: string;
  rank: number;
  score: number;
  grade: string;
  totalMiles: number;
  avgMpg: number;
  idlePct: number;
  idleFuelGal: number;
  idleTimeMin: number;
  driveTimeHrs: number;
  totalFuelGal: number;
  drivingFuelGal: number;
  hardEvents: number;
  hardEventBreakdown?: { hardAccels: number; hardBrakes: number; hardCorners: number };
  subScores: { idle: number; mpg: number; utilization: number; fuelEconomy: number; safety: number };
};

export type DriverScorecardResponse = {
  data: ScorecardDriver[];
  provider: string | null;
  fleetAvgMpg: number;
  period: { startDate: string; endDate: string };
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

// --- Whip Around types ---

/** Linked inspection row for defect detail (same org, whiparoundId === defect.inspectionId). */
export type WhiparoundInspectionSummary = {
  whiparoundId: number;
  driverName: string | null;
  inspectedAt: string;
  durationSec: number | null;
  passed: boolean | null;
  pdfUrl: string | null;
};

export type WhiparoundDefect = {
  id: string;
  whiparoundId: number;
  defectRef: string | null;
  inspectionId: number | null;
  assetId: number | null;
  assetName: string | null;
  teamId: number | null;
  teamName: string | null;
  driverName: string | null;
  defectName: string | null;
  description: string | null;
  status: string | null;
  defectPriority: string | null;
  defectType: string | null;
  severity: string | null;
  repeatedTimes: number | null;
  assignee: string | null;
  workOrder: string | null;
  defectSource: string | null;
  createdBy: string | null;
  defectCreatedAt: string | null;
  defectUpdatedAt: string | null;
  /** Present when API joins `whiparound_inspections` for `inspectionId`. */
  inspection?: WhiparoundInspectionSummary | null;
};

export type WhiparoundDefectsResponse = {
  defects: WhiparoundDefect[];
  total: number;
  limit: number;
  offset: number;
  statusCounts: Record<string, number>;
};

export type WhiparoundInspectionDefect = {
  id: string;
  whiparoundId: number;
  defectRef: string | null;
  inspectionId: number | null;
  defectName: string | null;
  description: string | null;
  status: string | null;
  defectPriority: string | null;
  defectType: string | null;
  assetName: string | null;
};

export type WhiparoundInspection = {
  id: string;
  whiparoundId: number;
  driverId: number | null;
  driverName: string | null;
  assetId: number | null;
  teamId: number | null;
  formId: number | null;
  completion: string | null;
  passed: boolean | null;
  pdfUrl: string | null;
  durationSec: number | null;
  inspectedAt: string;
  endedOnDeviceAt: string | null;
  defects: WhiparoundInspectionDefect[];
};

export type WhiparoundInspectionsResponse = {
  inspections: WhiparoundInspection[];
  total: number;
  limit: number;
  offset: number;
};

export type WhiparoundSyncStatus = {
  configured: boolean;
  status?: string;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt?: string;
};

// --- Query Keys ---

export const keys = {
  orgSettings: (orgId: string | undefined) =>
    ['org-settings', orgId] as const,
  fleetUnits: (orgId: string | undefined) =>
    ['fleet-units', orgId] as const,
  vehicleUtilization: (orgId: string | undefined, startDate?: string, endDate?: string) =>
    ['vehicle-utilization', orgId, startDate, endDate] as const,
  driverUtilization: (orgId: string | undefined, startDate?: string, endDate?: string) =>
    ['driver-utilization', orgId, startDate, endDate] as const,
  repairs: (orgId: string | undefined) =>
    ['repairs', orgId] as const,
  unitDetail: (orgId: string | undefined, vin: string) =>
    ['unit-detail', orgId, vin] as const,
  servicePlan: (orgId: string) =>
    ['service-plan', orgId] as const,
  driverScorecard: (orgId: string | undefined, startDate?: string, endDate?: string) =>
    ['driver-scorecard', orgId, startDate, endDate] as const,
  whiparoundDefects: (orgId: string | undefined, filters?: Record<string, string>) =>
    ['whiparound-defects', orgId, filters] as const,
  whiparoundInspections: (orgId: string | undefined, filters?: Record<string, string>) =>
    ['whiparound-inspections', orgId, filters] as const,
  whiparoundSyncStatus: (orgId: string | undefined) =>
    ['whiparound-sync-status', orgId] as const,
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
  });
}

/**
 * Normalized vehicle utilization — provider-agnostic.
 * The backend TelematicsService routes to the correct provider table.
 * Optional date params filter server-side; omit for all-time data (backend returns all records).
 */
export function useVehicleUtilizationQuery(
  startDate?: string,
  endDate?: string
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.vehicleUtilization(organization?.id, startDate, endDate),
    queryFn: async (): Promise<VehicleUtilization[]> => {
      const api = await getApi();
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const resp = await api.get<{ data: VehicleUtilization[] }>(
        `/telematics/normalized/vehicle-utilization${qs}`
      );
      return resp.data;
    },
    enabled: !!organization?.id,
  });
}

/**
 * Normalized driver utilization — provider-agnostic.
 */
export function useDriverUtilizationQuery(
  enabled = true,
  startDate?: string,
  endDate?: string
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.driverUtilization(organization?.id, startDate, endDate),
    queryFn: async (): Promise<DriverUtilization[]> => {
      const api = await getApi();
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const resp = await api.get<{ data: DriverUtilization[]; provider: string }>(
        `/telematics/normalized/driver-utilization${qs}`
      );
      return resp.data;
    },
    enabled: !!organization?.id && enabled,
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
  });
}

export type UnitType = 'TRACTOR' | 'TRAILER' | 'SWITCHER' | 'BOX_TRUCK' | 'AUTO' | 'MISC';

export type ServicePlanUnit = {
  id: string;
  repairUnitId: string;
  repairUnitNumber: string | null;
  repairVin: string | null;
  telematicsVin: string | null;
  telematicsVehicleId: string | null;
  customUnitName: string | null;
  unitType: UnitType | null;
  isTelematicsOnly: boolean;
  isIncluded: boolean;
  isConfirmed: boolean;
  matchType: 'AUTO' | 'MANUAL' | 'UNMATCHED';
  matchConfidence: number | null;
  notes: string | null;
  telematicsData?: {
    vehicleNumber: string;
    lastDataDate: string;
    hasTelematicsData: boolean;
  } | null;
  suggestedMatch?: {
    telematicsVin: string;
    vehicleNumber: string;
  } | null;
};

export type ServicePlanSummary = {
  total: number;
  matched: number;
  unmatched: number;
  fromRepair: number;
  fromTelematicsOnly: number;
  withTelematicsData: number;
  unmatchedFromRepair: number;
  unmatchedFromTelematics: number;
  autoMatched: number;
  manualMatched: number;
  confirmed: number;
  excluded: number;
  included: number;
};

export function useServicePlanQuery() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.servicePlan(organization?.id ?? ''),
    queryFn: async () => {
      const api = await getApi();
      return api.get<{ units: ServicePlanUnit[]; summary: ServicePlanSummary }>(
        '/admin/service-plan/units?pageSize=50000'
      );
    },
    enabled: !!organization?.id,
  });
}

export function useServicePlanSummaryQuery() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: ['service-plan-summary', organization?.id],
    queryFn: async () => {
      const api = await getApi();
      return api.get<{ units: ServicePlanUnit[]; summary: ServicePlanSummary }>(
        '/admin/service-plan/units?pageSize=1&page=1'
      );
    },
    enabled: !!organization?.id,
  });
}

/**
 * Driver scorecard — weighted composite score per driver for the given date range.
 * Currently Motive-only. Returns empty data for Samsara orgs.
 */
export function useDriverScorecardQuery(
  enabled = true,
  startDate?: string,
  endDate?: string
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  return useQuery({
    queryKey: keys.driverScorecard(organization?.id, startDate, endDate),
    queryFn: async (): Promise<DriverScorecardResponse> => {
      const api = await getApi();
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api.get<DriverScorecardResponse>(`/telematics/normalized/driver-scorecard${qs}`);
    },
    enabled: !!organization?.id && enabled,
  });
}

// --- Whip Around hooks ---

export function useWhiparoundDefects(
  filters: {
    status?: string;
    teamId?: string;
    defectType?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();

  return useQuery({
    queryKey: keys.whiparoundDefects(organization?.id, filters as Record<string, string>),
    queryFn: async (): Promise<WhiparoundDefectsResponse> => {
      const api = await getApi();
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.teamId) params.set('teamId', filters.teamId);
      if (filters.defectType) params.set('defectType', filters.defectType);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.offset) params.set('offset', String(filters.offset));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api.get<WhiparoundDefectsResponse>(`/whiparound/defects${qs}`);
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useWhiparoundInspections(
  filters: {
    from?: string;
    to?: string;
    assetId?: string;
    passed?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();

  return useQuery({
    queryKey: keys.whiparoundInspections(organization?.id, filters as Record<string, string>),
    queryFn: async (): Promise<WhiparoundInspectionsResponse> => {
      const api = await getApi();
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.assetId) params.set('assetId', filters.assetId);
      if (filters.passed !== undefined) params.set('passed', String(filters.passed));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.offset) params.set('offset', String(filters.offset));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return api.get<WhiparoundInspectionsResponse>(`/whiparound/inspections${qs}`);
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWhiparoundSyncStatus() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();

  return useQuery({
    queryKey: keys.whiparoundSyncStatus(organization?.id),
    queryFn: async (): Promise<WhiparoundSyncStatus> => {
      const api = await getApi();
      return api.get<WhiparoundSyncStatus>('/whiparound/sync-status');
    },
    enabled: !!organization?.id,
    staleTime: 2 * 60 * 1000, // 2 min — check freshness more often
  });
}
