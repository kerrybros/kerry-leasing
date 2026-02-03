// Type definitions for frontend use

export interface Unit {
  id: string;
  vin: string;
  unitNumber: string;
  make?: string;
  model?: string;
  year?: number;
  status?: string;
}

export interface Repair {
  id: string;
  invoiceNumber?: string;
  description?: string;
  date: string;
  total?: number;
  status?: string;
}

export interface TelematicsDaily {
  id: string;
  clerkOrgId: string;
  vin: string;
  date: string;
  milesDriven: number | null;
  idleMinutes: number | null;
  fuelGallons: number | null;
  avgMpg: number | null;
  engineHours: number | null;
  source: 'SAMSARA' | 'MOTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface TelematicsSummary {
  period: string;
  vehicleCount: number;
  totalMiles: number;
  totalIdleMinutes: number;
  totalFuelGallons: number;
  avgMpg: number;
}

export interface UnitWithRepairs {
  unit: Unit;
  repairs: Repair[];
  count: number;
}

export interface FleetSummary {
  units: Unit[];
  count: number;
  telematicsSummary?: TelematicsSummary;
}
