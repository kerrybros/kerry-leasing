/**
 * Convert Motive's internal Driver Fuel Performance JSON (as served to the
 * Fleet Dashboard) into the exact CSV layout of the dashboard's own export.
 *
 * The JSON is metric (km, litres, kg, km/L, km/h); the dashboard converts to
 * US units for display and export. Reproducing that conversion here means a
 * pulled file is byte-identical to a scheduled/emailed one, so ONE parser and
 * one audit format serve every intake path. Verified 2026-09-18: the
 * regenerated 2026-09-13 file diffed identical to Motive's emailed CSV.
 */

export interface PortalVehicleRow {
  number: string | number;
  average_fuel_economy: number | null;
  moving_fuel_economy: number | null;
  total_distance: number;
  total_fuel: number;
  carbon_emissions: number;
  vehicle_utilization: number;
  driving_time_hours: number;
  driving_fuel_consumed: number;
  idling_time_hours: number;
  idling_fuel_consumed: number;
  over_rpm_percent: number;
  average_driving_speed: number;
  fuel_cost: number;
  cruise_distance_percent: number;
  cruise_time_percent: number;
  hard_braking: number;
  hard_acceleration: number;
  hard_cornering: number;
}

export interface PortalDriverRow {
  id: number;
  name: string;
  driver_company_id?: string | null;
  groups?: Array<string | { name?: string }>;
  vehicles: PortalVehicleRow[];
}

export interface PortalReportPage {
  details: PortalDriverRow[];
  total?: number;
  per_page?: number;
  page_no?: number;
  summary?: { start_date?: string; end_date?: string };
}

const KM_PER_MI = 1.609344;
const L_PER_GAL = 3.785411784;
const LB_PER_KG = 2.20462262185;

export const PORTAL_CSV_HEADER = [
  'Driver', 'Driver ID', 'Group', 'Vehicle', 'Avg. MPG', 'Moving MPG', 'Total Distance (mi)',
  'Total Fuel (gal)', 'Est. Carbon Emissions (lbs)', 'Utilization (%)', 'Driving Time (mins)',
  'Driving Fuel (gal)', 'Idling Time (mins)', 'Idled Fuel (gal)', 'Over RPM (%)', 'Avg. Speed (mph)',
  'Fuel Cost (USD)', 'Cruise Distance (%)', 'Cruise Time (%)', 'Hard Braking (events/1K mi)',
  'Hard Acceleration (events/1K mi)', 'Hard Cornering (events/1K mi)',
];

/** Motive's number formatting: 2 decimals, trailing zero stripped, at least one decimal. */
export function fmtNum(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '';
  const v = Math.round((x + 1e-9) * 100) / 100;
  let s = v.toFixed(2).replace(/0$/, '');
  if (s.endsWith('.')) s += '0';
  return s;
}

function fmtMoney(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '';
  return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function groupName(g: string | { name?: string }): string {
  return typeof g === 'string' ? g : (g?.name ?? '');
}

export function portalRowsToCsv(details: PortalDriverRow[]): string {
  const lines = [PORTAL_CSV_HEADER.join(',')];
  for (const d of details) {
    for (const v of d.vehicles ?? []) {
      const cells = [
        d.name,
        d.driver_company_id ?? '',
        (d.groups ?? []).map(groupName).join(','),
        String(v.number),
        v.average_fuel_economy == null ? '' : fmtNum(v.average_fuel_economy * L_PER_GAL / KM_PER_MI),
        v.moving_fuel_economy == null ? '' : fmtNum(v.moving_fuel_economy * L_PER_GAL / KM_PER_MI),
        fmtNum(v.total_distance / KM_PER_MI),
        fmtNum(v.total_fuel / L_PER_GAL),
        fmtNum(v.carbon_emissions * LB_PER_KG),
        fmtNum(v.vehicle_utilization * 100),
        fmtNum(v.driving_time_hours * 60),
        fmtNum(v.driving_fuel_consumed / L_PER_GAL),
        fmtNum(v.idling_time_hours * 60),
        fmtNum(v.idling_fuel_consumed / L_PER_GAL),
        fmtNum(v.over_rpm_percent),
        fmtNum(v.average_driving_speed / KM_PER_MI),
        fmtMoney(v.fuel_cost),
        fmtNum(v.cruise_distance_percent),
        fmtNum(v.cruise_time_percent),
        fmtNum(v.hard_braking * KM_PER_MI),
        fmtNum(v.hard_acceleration * KM_PER_MI),
        fmtNum(v.hard_cornering * KM_PER_MI),
      ];
      lines.push(cells.map(csvCell).join(','));
    }
  }
  return lines.join('\n') + '\n';
}
