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
  vin: string | null;
  startTime: string;
  endTime: string | null;
  date: string;
  durationMinutes: number | null;
  idleFuelGallons: number | null;
  lat: number | null;
  lon: number | null;
  location: string | null;
  driverId: number | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  endType: string | null;
}

export interface EnrichedIdleEvent extends IdleEvent {
  geofenceId: string | null;
  geofenceName: string | null;
  geofenceCategory: string | null;
  groupKey: string;
}

export interface IdleEventsResponse {
  provider: 'MOTIVE' | 'SAMSARA' | null;
  totalEvents: number;
  totalIdleMinutes: number;
  totalIdleFuel: number;
  repeatOffenders: { unitNumber: string; count: number; totalMinutes: number; totalFuel: number }[];
  longestEvents: IdleEvent[];
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
  vehicles: string[];   // unit numbers
  drivers: string[];    // driver display names
  minDurationMinutes: number;
  endTypes: string[];   // 'vehicle_moving' | 'engine_stop'
  geofenceScope: 'all' | 'inside' | 'outside';
}

export interface ModalTarget {
  type: 'all' | 'unit' | 'driver';
  value?: string;
  initialTab?: 'events' | 'drivers' | 'vehicles' | 'geofences';
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function driverLabel(event: Pick<IdleEvent, 'driverFirstName' | 'driverLastName'>): string {
  const first = event.driverFirstName?.trim();
  const last = event.driverLastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return 'Unassigned';
}
