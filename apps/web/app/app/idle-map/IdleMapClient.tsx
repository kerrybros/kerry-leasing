'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useApiClient } from '@/hooks/useApiClient';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';

import { useOrgSettingsQuery } from '@/hooks/useDataQueries';

import {
  type DateRange,
  type ViewMode,
  type BubbleMode,
  type GroupBy,
  type FilterState,
  type ModalTarget,
  type IdleEventsResponse,
  type GeofencesResponse,
  type EnrichedIdleEvent,
  type Geofence,
  driverLabel,
} from './types';

import IdleMapToolbar from './components/IdleMapToolbar';
import IdleMapCanvas from './components/IdleMapCanvas';
import SummaryOverlay from './components/SummaryOverlay';
import UnitListPanel from './components/UnitListPanel';
import InsideOutsideBar from './components/InsideOutsideBar';
import IdleReportModal from './components/IdleReportModal';

function todayYmd(): string {
  return new Date().toISOString().split('T')[0]!;
}

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

function defaultDateRange(): DateRange {
  return { from: daysAgoYmd(6), to: todayYmd() };
}

function parseYmd(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export default function IdleMapClient() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();
  const { data: orgSettings } = useOrgSettingsQuery();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- URL param helpers (shallow, no server re-fetch) ---
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v == null || v === '') params.delete(k);
        else params.set(k, v);
      });
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [pathname, searchParams]
  );

  // --- State (hydrated from URL on mount) ---
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const from = parseYmd(searchParams.get('from'));
    const to = parseYmd(searchParams.get('to'));
    if (from && to) return { from, to };
    return defaultDateRange();
  });

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (searchParams.get('view') === 'heatmap' ? 'heatmap' : 'bubbles')
  );

  const [bubbleMode, setBubbleMode] = useState<BubbleMode>(
    () => (searchParams.get('bubble') === 'raw' ? 'raw' : 'clustered')
  );

  const [groupBy, setGroupBy] = useState<GroupBy>(
    () => (searchParams.get('groupBy') === 'driver' ? 'driver' : 'vehicle')
  );

  const [geofenceVisible, setGeofenceVisible] = useState<boolean>(
    () => searchParams.get('geofences') !== 'off'
  );

  const [filters, setFilters] = useState<FilterState>({
    vehicles: [],
    drivers: [],
    minDurationMinutes: 0,
    endTypes: [],
    geofenceScope: 'all',
  });

  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(true);

  // Sync UI state to URL params
  const handleDateRangeChange = useCallback(
    (range: DateRange) => {
      setDateRange(range);
      updateParams({ from: range.from, to: range.to });
    },
    [updateParams]
  );

  const handleViewModeChange = useCallback(
    (v: ViewMode) => {
      setViewMode(v);
      updateParams({ view: v });
    },
    [updateParams]
  );

  const handleBubbleModeChange = useCallback(
    (v: BubbleMode) => {
      setBubbleMode(v);
      updateParams({ bubble: v });
    },
    [updateParams]
  );

  const handleGroupByChange = useCallback(
    (v: GroupBy) => {
      setGroupBy(v);
      updateParams({ groupBy: v });
    },
    [updateParams]
  );

  const handleGeofenceVisibleChange = useCallback(
    (v: boolean) => {
      setGeofenceVisible(v);
      updateParams({ geofences: v ? null : 'off' });
    },
    [updateParams]
  );

  // --- API Fetches ---
  const { data: eventsData, isLoading: eventsLoading } = useQuery<IdleEventsResponse>({
    queryKey: ['idle-map-events', organization?.id, dateRange.from, dateRange.to],
    queryFn: async () => {
      const api = await getApi();
      return api.get<IdleEventsResponse>(
        `/fleet/idle-events?startDate=${dateRange.from}&endDate=${dateRange.to}&limit=2000`
      );
    },
    enabled: !!organization?.id,
  });

  const { data: geofencesData } = useQuery<GeofencesResponse>({
    queryKey: ['idle-map-geofences', organization?.id],
    queryFn: async () => {
      const api = await getApi();
      return api.get<GeofencesResponse>('/fleet/geofences');
    },
    enabled: !!organization?.id,
  });

  const geofences: Geofence[] = geofencesData?.geofences ?? [];

  // --- Client-side Turf geofence intersection ---
  const enrichedEvents = useMemo<EnrichedIdleEvent[]>(() => {
    const rawEvents = eventsData?.events ?? [];

    return rawEvents.map(event => {
      let geofenceId: string | null = null;
      let geofenceName: string | null = null;
      let geofenceCategory: string | null = null;

      if (event.lat != null && event.lon != null) {
        const pt = point([event.lon, event.lat]);
        for (const gf of geofences) {
          if (!gf.locationPoints || gf.locationPoints.length < 3) continue;
          try {
            // Close the ring if needed
            const coords = gf.locationPoints.map(p => [p.lon, p.lat] as [number, number]);
            const first = coords[0]!;
            const last = coords[coords.length - 1]!;
            if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
            const poly = polygon([coords]);
            if (booleanPointInPolygon(pt, poly)) {
              geofenceId = gf.id;
              geofenceName = gf.name;
              geofenceCategory = gf.category ?? null;
              break;
            }
          } catch {
            // malformed polygon — skip
          }
        }
      }

      const groupKey =
        groupBy === 'driver'
          ? driverLabel(event)
          : (event.unitNumber ?? 'Unknown');

      return { ...event, geofenceId, geofenceName, geofenceCategory, groupKey };
    });
  }, [eventsData?.events, geofences, groupBy]);

  // --- Apply filters ---
  const filteredEvents = useMemo<EnrichedIdleEvent[]>(() => {
    return enrichedEvents.filter(e => {
      if (filters.vehicles.length > 0 && !filters.vehicles.includes(e.unitNumber ?? '')) return false;
      if (filters.drivers.length > 0 && !filters.drivers.includes(driverLabel(e))) return false;
      if (filters.minDurationMinutes > 0 && (e.durationMinutes ?? 0) < filters.minDurationMinutes) return false;
      if (filters.endTypes.length > 0 && !filters.endTypes.includes(e.endType ?? '')) return false;
      if (filters.geofenceScope === 'inside' && e.geofenceId == null) return false;
      if (filters.geofenceScope === 'outside' && e.geofenceId != null) return false;
      return true;
    });
  }, [enrichedEvents, filters]);

  const dieselPrice = orgSettings?.dieselPricePerGallon ?? 5.0;

  return (
    <div className="flex flex-col flex-1 min-h-0 px-4 pb-4 gap-2">
      <IdleMapToolbar
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        bubbleMode={bubbleMode}
        onBubbleModeChange={handleBubbleModeChange}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
        geofenceVisible={geofenceVisible}
        onGeofenceVisibleChange={handleGeofenceVisibleChange}
        filters={filters}
        onFiltersChange={setFilters}
        events={enrichedEvents}
        loading={eventsLoading}
      />

      <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-border" style={{ minHeight: 520 }}>
        <IdleMapCanvas
          events={filteredEvents}
          geofences={geofences}
          viewMode={viewMode}
          bubbleMode={bubbleMode}
          geofenceVisible={geofenceVisible}
          loading={eventsLoading}
          onEventClick={(eventId) => {
            setModalTarget({ type: 'event', eventId, initialTab: 'events' });
          }}
          onClusterClick={(groupKey) => {
            if (!groupKey) {
              // Cluster of mixed units: open full report
              setModalTarget({ type: 'all', initialTab: 'events' });
            } else {
              setModalTarget({
                type: groupBy === 'driver' ? 'driver' : 'unit',
                value: groupKey,
                initialTab: 'events',
              });
            }
          }}
        />

        {/* Floating overlays inside map */}
        <SummaryOverlay
          events={filteredEvents}
          loading={eventsLoading}
          dieselPrice={dieselPrice}
          dateRange={dateRange}
          onViewReport={() => setModalTarget({ type: 'all', initialTab: 'events' })}
        />

        <UnitListPanel
          events={filteredEvents}
          groupBy={groupBy}
          open={unitPanelOpen}
          onToggle={() => setUnitPanelOpen(v => !v)}
        />
      </div>

      <InsideOutsideBar events={filteredEvents} loading={eventsLoading} dieselPrice={dieselPrice} />

      {modalTarget && (
        <IdleReportModal
          events={filteredEvents}
          geofences={geofences}
          dateRange={dateRange}
          dieselPrice={dieselPrice}
          scopeFilter={modalTarget}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  );
}
