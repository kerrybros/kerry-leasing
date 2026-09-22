/**
 * Parser for Motive's Fleet Dashboard "Driver Fuel Performance" CSV export.
 *
 * The export is the source of truth for driving/idle time (Motive support case
 * 11057761): the v2/driver_utilization API uses a different calculation model
 * and under-counts low-speed (yard) driving. This parser is deliberately STRICT
 * about the header row: a silent layout change upstream must fail loudly here
 * rather than feed wrong numbers into the scorecard.
 *
 * Layout observed 2026-09-14 (22 columns, one row per driver+vehicle, no date
 * column; the window comes from the email subject or the filename):
 *   Driver, Driver ID, Group, Vehicle, Avg. MPG, Moving MPG, Total Distance (mi),
 *   Total Fuel (gal), Est. Carbon Emissions (lbs), Utilization (%),
 *   Driving Time (mins), Driving Fuel (gal), Idling Time (mins), Idled Fuel (gal),
 *   Over RPM (%), Avg. Speed (mph), Fuel Cost (USD), Cruise Distance (%),
 *   Cruise Time (%), Hard Braking (events/1K mi), Hard Acceleration (events/1K mi),
 *   Hard Cornering (events/1K mi)
 */

export interface DriverFuelPerformanceRow {
  driverName: string;
  driverNormalizedName: string;
  driverCompanyId: string | null;
  groupName: string | null;
  vehicleName: string;
  avgMpg: number | null;
  movingMpg: number | null;
  totalDistanceMi: number | null;
  totalFuelGal: number | null;
  carbonLbs: number | null;
  utilizationPct: number | null;
  drivingTimeMin: number | null;
  drivingFuelGal: number | null;
  idlingTimeMin: number | null;
  idledFuelGal: number | null;
  overRpmPct: number | null;
  avgSpeedMph: number | null;
  fuelCostUsd: number | null;
  cruiseDistancePct: number | null;
  cruiseTimePct: number | null;
  hardBrakingPer1kMi: number | null;
  hardAccelPer1kMi: number | null;
  hardCorneringPer1kMi: number | null;
  /** Original CSV cells keyed by header, for audit. */
  raw: Record<string, string>;
}

/** Header → field. Order does not matter; every REQUIRED header must be present. */
const COLUMN_MAP: Record<string, keyof Omit<DriverFuelPerformanceRow, 'driverNormalizedName' | 'raw'>> = {
  'Driver': 'driverName',
  'Driver ID': 'driverCompanyId',
  'Group': 'groupName',
  'Vehicle': 'vehicleName',
  'Avg. MPG': 'avgMpg',
  'Moving MPG': 'movingMpg',
  'Total Distance (mi)': 'totalDistanceMi',
  'Total Fuel (gal)': 'totalFuelGal',
  'Est. Carbon Emissions (lbs)': 'carbonLbs',
  'Utilization (%)': 'utilizationPct',
  'Driving Time (mins)': 'drivingTimeMin',
  'Driving Fuel (gal)': 'drivingFuelGal',
  'Idling Time (mins)': 'idlingTimeMin',
  'Idled Fuel (gal)': 'idledFuelGal',
  'Over RPM (%)': 'overRpmPct',
  'Avg. Speed (mph)': 'avgSpeedMph',
  'Fuel Cost (USD)': 'fuelCostUsd',
  'Cruise Distance (%)': 'cruiseDistancePct',
  'Cruise Time (%)': 'cruiseTimePct',
  'Hard Braking (events/1K mi)': 'hardBrakingPer1kMi',
  'Hard Acceleration (events/1K mi)': 'hardAccelPer1kMi',
  'Hard Cornering (events/1K mi)': 'hardCorneringPer1kMi',
};

/** The scorecard cannot run without these. Extra/renamed cosmetic columns are tolerated. */
export const REQUIRED_HEADERS = [
  'Driver',
  'Vehicle',
  'Total Distance (mi)',
  'Total Fuel (gal)',
  'Driving Time (mins)',
  'Driving Fuel (gal)',
  'Idling Time (mins)',
  'Idled Fuel (gal)',
] as const;

const STRING_FIELDS = new Set<string>(['driverName', 'driverCompanyId', 'groupName', 'vehicleName']);

export class ReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportParseError';
  }
}

export function normalizeDriverName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** "$1,234.56" → 1234.56; "" → null; non-numeric → throws. */
function parseNumber(header: string, cell: string, line: number): number | null {
  const t = cell.trim();
  if (t === '' || t === '-' || t.toUpperCase() === 'N/A') return null;
  const cleaned = t.replace(/[$,%]/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new ReportParseError(`Line ${line}: column "${header}" is not numeric: "${cell}"`);
  }
  return n;
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF/LF, trailing newline. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.startsWith('﻿') ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (inQuotes) throw new ReportParseError('Unterminated quoted field at end of file');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface ParsedDriverFuelPerformance {
  headers: string[];
  rows: DriverFuelPerformanceRow[];
}

export function parseDriverFuelPerformanceCsv(text: string): ParsedDriverFuelPerformance {
  const table = parseCsv(text);
  if (table.length === 0) throw new ReportParseError('CSV is empty');

  const headers = table[0].map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new ReportParseError(
      `Missing required column(s): ${missing.join(', ')}. Got: ${headers.join(' | ')}`
    );
  }
  const unknown = headers.filter((h) => !(h in COLUMN_MAP));
  if (unknown.length > 0) {
    // Not fatal, but surface it so a layout change is noticed in logs.
    console.warn(`[motive-report] Unrecognized column(s) ignored: ${unknown.join(', ')}`);
  }

  const rows: DriverFuelPerformanceRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    if (cells.length !== headers.length) {
      throw new ReportParseError(`Line ${line}: expected ${headers.length} cells, got ${cells.length}`);
    }
    const raw: Record<string, string> = {};
    const out: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      raw[h] = cells[i];
      const field = COLUMN_MAP[h];
      if (!field) return;
      if (STRING_FIELDS.has(field)) {
        const v = cells[i].trim();
        out[field] = v === '' ? null : v;
      } else {
        out[field] = parseNumber(h, cells[i], line);
      }
    });
    if (!out.driverName) throw new ReportParseError(`Line ${line}: empty Driver`);
    if (!out.vehicleName) throw new ReportParseError(`Line ${line}: empty Vehicle`);
    rows.push({
      ...(out as Omit<DriverFuelPerformanceRow, 'driverNormalizedName' | 'raw'>),
      driverNormalizedName: normalizeDriverName(out.driverName as string),
      raw,
    });
  }
  return { headers, rows };
}
