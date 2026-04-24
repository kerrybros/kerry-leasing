export type ViewMode = 'heatmap' | 'bubbles';
export type BubbleMode = 'clustered' | 'raw';
export type GroupBy = 'vehicle' | 'driver';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface IdleEvent {
  id: string;
  unitNumber: string | null;
  startTime: string;
  endTime: string | null;
  date: string;
  durationMinutes: number | null;
  idleFuelGallons: number | null;
  lat: number | null;
  lon: number | null;
  location: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  endType: string | null;
  unitType: string | null;
}

export interface EnrichedIdleEvent extends IdleEvent {
  geofenceId: string | null;
  geofenceName: string | null;
  geofenceCategory: string | null;
  groupKey: string;
}

export interface IdleEventsResponse {
  provider: 'MOTIVE' | 'SAMSARA' | null;
  events: IdleEvent[];
}

export interface GeofencePoint {
  lat: number;
  lon: number;
}

export interface Geofence {
  id: string;
  name: string;
  category: string | null;
  locationPoints: GeofencePoint[];
  address: string | null;
}

export interface GeofencesResponse {
  geofences: Geofence[];
}

export interface FilterState {
  geofenceScope: 'all' | 'inside' | 'outside';
}

export type ModalTarget =
  | { type: 'all';      initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences' }
  | { type: 'unit';     value: string; initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences' }
  | { type: 'driver';   value: string; initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences' }
  | { type: 'event';    eventId: string; initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences' }
  | { type: 'eventSet'; eventIds: string[]; initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences' };

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes.toLocaleString('en-US')}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h.toLocaleString('en-US')}h ${m}m` : `${h.toLocaleString('en-US')}h`;
}

/** Returns formatted gallons or "—" when the value is null/zero (data not available from ELD). */
export function fuelStr(gallons: number | null | undefined): string {
  if (!gallons) return '—';
  return `${gallons.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} gal`;
}

/** Returns formatted cost or "—" when fuel is null/zero. */
export function costStr(gallons: number | null | undefined, pricePerGallon: number): string {
  if (!gallons) return '—';
  return `$${Math.round(gallons * pricePerGallon).toLocaleString('en-US')}`;
}

/** Subtext for cost displays: retail diesel rate and EIA series region (matches fleet KPIs). */
export function dieselPriceSourceSubtext(pricePerGallon: number): string {
  return `@ $${pricePerGallon.toFixed(2)}/gal (EIA Midwest)`;
}

/**
 * True when lat/lon are present, not a known "no GPS fix" sentinel, and within WGS84 bounds.
 * Motive emits (-1, -1) and some ELDs emit (0, 0) when position is unknown — both plot
 * off the coast of West Africa and must be rejected before rendering.
 */
export function hasValidCoords<T extends { lat: number | null; lon: number | null }>(
  event: T
): event is T & { lat: number; lon: number } {
  const { lat, lon } = event;
  if (lat == null || lon == null) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat === -1 && lon === -1) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
}

export function driverLabel(event: Pick<IdleEvent, 'driverFirstName' | 'driverLastName'>): string {
  const first = event.driverFirstName?.trim();
  const last = event.driverLastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return 'Unassigned';
}
