'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin } from 'lucide-react';

import type { EnrichedIdleEvent, Geofence, ViewMode, BubbleMode } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  geofences: Geofence[];
  viewMode: ViewMode;
  bubbleMode: BubbleMode;
  geofenceVisible: boolean;
  loading: boolean;
  onEventClick: (eventId: string) => void;
  onClusterClick: (groupKey: string) => void;
}

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

function useMapTheme(): string {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);

  return isDark ? DARK_STYLE : LIGHT_STYLE;
}

function eventsToGeoJSON(events: EnrichedIdleEvent[]): GeoJSON.FeatureCollection {
  const maxMinutes = Math.max(...events.map(e => e.durationMinutes ?? 0), 1);
  return {
    type: 'FeatureCollection',
    features: events
      .filter(e => e.lat != null && e.lon != null)
      .map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lon!, e.lat!] },
        properties: {
          id: e.id,
          groupKey: e.groupKey,
          idleMinutes: e.durationMinutes ?? 0,
          idleMinutesNorm: (e.durationMinutes ?? 0) / maxMinutes,
          unitNumber: e.unitNumber ?? '',
          driverName: [e.driverFirstName, e.driverLastName].filter(Boolean).join(' ') || 'Unassigned',
          geofenceName: e.geofenceName ?? '',
        },
      })),
  };
}

function geofencesToGeoJSON(geofences: Geofence[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const gf of geofences) {
    if (!gf.locationPoints || gf.locationPoints.length < 3) continue;
    const coords = gf.locationPoints.map(p => [p.lon, p.lat] as [number, number]);
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {
        id: gf.id,
        name: gf.name,
        category: gf.category ?? 'Uncategorized',
        address: gf.address ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// Category -> color expression for MapLibre.
// MapLibre cannot resolve CSS variables — use hardcoded colors that approximate the theme palette.
const GEOFENCE_COLOR_EXPR: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  ['Yard', 'Terminal'], '#2563eb',   // blue-600 ≈ primary
  'Customer', '#16a34a',             // green-600
  'Fuel Station', '#f59e0b',         // amber-500
  '#94a3b8',                         // slate-400 fallback
];

// Cluster bubble radius based on point_count
const CLUSTER_RADIUS_EXPR: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'point_count'],
  1, 14,
  10, 22,
  50, 32,
  200, 40,
];

// Raw bubble radius based on idleMinutes
const RAW_RADIUS_EXPR: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'idleMinutes'],
  5, 5,
  30, 9,
  60, 13,
  120, 18,
  240, 22,
];

export default function IdleMapCanvas({
  events,
  geofences,
  viewMode,
  bubbleMode,
  geofenceVisible,
  loading,
  onEventClick,
  onClusterClick,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = useMapTheme();

  const eventsWithCoords = useMemo(() => events.filter(e => e.lat != null && e.lon != null), [events]);
  const isEmpty = !loading && eventsWithCoords.length === 0;
  const noCoords = !loading && events.length > 0 && eventsWithCoords.length === 0;

  const isClustered = viewMode === 'bubbles' && bubbleMode === 'clustered';
  const isRaw = viewMode === 'bubbles' && bubbleMode === 'raw';
  const isHeatmap = viewMode === 'heatmap';

  const pointsGeoJSON = useMemo(
    () => eventsToGeoJSON(events),
    [events]
  );

  const geofenceGeoJSON = useMemo(() => geofencesToGeoJSON(geofences), [geofences]);

  // Find highest-minute cluster candidate for pulsing marker
  const topEvent = useMemo(() => {
    if (!isClustered || eventsWithCoords.length === 0) return null;
    return eventsWithCoords.reduce((best, e) =>
      (e.durationMinutes ?? 0) > (best.durationMinutes ?? 0) ? e : best
    );
  }, [eventsWithCoords, isClustered]);

  // Fit bounds to events when data changes
  useEffect(() => {
    if (!mapRef.current || eventsWithCoords.length === 0) return;
    const lngs = eventsWithCoords.map(e => e.lon!);
    const lats = eventsWithCoords.map(e => e.lat!);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    try {
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 60, maxZoom: 13, duration: 800 }
      );
    } catch {
      // ignore if map not ready
    }
  }, [eventsWithCoords.length]); // only refit when count changes, not on every filter

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!mapRef.current) return;
      const map = mapRef.current.getMap();

      if (isClustered) {
        // Cluster click: groupKey can't be reliably aggregated across mixed-unit clusters.
        // Open the full report modal (caller handles '' as "all events").
        const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: ['cluster-circles'] });
        if (clusterFeatures.length > 0) {
          onClusterClick('');
          return;
        }
        // Individual un-clustered point: scope to that point's groupKey.
        const individualFeatures = map.queryRenderedFeatures(e.point, { layers: ['individual-circles'] });
        if (individualFeatures.length > 0) {
          const f = individualFeatures[0]!;
          const groupKey = (f.properties as any).groupKey ?? '';
          if (groupKey) onClusterClick(groupKey);
          else onEventClick((f.properties as any).id);
          return;
        }
      }

      if (isRaw) {
        const features = map.queryRenderedFeatures(e.point, { layers: ['raw-circles'] });
        if (features.length > 0) {
          onEventClick((features[0]!.properties as any).id);
        }
        return;
      }

      if (isHeatmap) {
        // At zoom >= 13 the heatmap fades out and circle points appear — query both layers.
        const circleFeatures = map.queryRenderedFeatures(e.point, { layers: ['heatmap-circles'] });
        if (circleFeatures.length > 0) {
          const f = circleFeatures[0]!;
          const groupKey = (f.properties as any)?.groupKey;
          if (groupKey) onClusterClick(groupKey);
          else onEventClick((f.properties as any).id);
          return;
        }
        const heatFeatures = map.queryRenderedFeatures(e.point, { layers: ['heatmap-layer'] });
        if (heatFeatures.length > 0) {
          const f = heatFeatures[0]!;
          const groupKey = (f.properties as any)?.groupKey;
          if (groupKey) onClusterClick(groupKey);
          else onEventClick((f.properties as any).id);
        }
      }
    },
    [isClustered, isRaw, isHeatmap, onEventClick, onClusterClick]
  );

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={{ longitude: -95, latitude: 38, zoom: 4 }}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={
          isClustered
            ? ['cluster-circles', 'individual-circles']
            : isRaw
            ? ['raw-circles']
            : ['heatmap-layer', 'heatmap-circles']
        }
        onClick={handleMapClick}
        cursor="pointer"
      >
        {/* ── Geofence layer ─────────────────────────────────── */}
        {geofenceVisible && geofences.length > 0 && (
          <Source id="geofences" type="geojson" data={geofenceGeoJSON}>
            <Layer
              id="geofence-fill"
              type="fill"
              paint={{
                'fill-color': GEOFENCE_COLOR_EXPR,
                'fill-opacity': 0.12,
              }}
            />
            <Layer
              id="geofence-outline"
              type="line"
              paint={{
                'line-color': GEOFENCE_COLOR_EXPR,
                'line-opacity': 0.6,
                'line-width': 1.5,
              }}
            />
          </Source>
        )}

        {/* ── Heatmap mode ───────────────────────────────────── */}
        {isHeatmap && (
          <Source id="heatmap-source" type="geojson" data={pointsGeoJSON}>
            <Layer
              id="heatmap-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': ['get', 'idleMinutesNorm'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 8, 30, 12, 15],
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0, 'rgba(0,0,0,0)',
                  0.2, 'rgba(63,94,251,0.5)',
                  0.5, 'rgba(252,211,31,0.8)',
                  0.8, 'rgba(255,100,20,0.9)',
                  1, 'rgba(220,20,20,1)',
                ],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 0],
              }}
            />
            {/* Precise circle layer at high zoom */}
            <Layer
              id="heatmap-circles"
              type="circle"
              minzoom={13}
              paint={{
                'circle-radius': 7,
                'circle-color': '#d9a528',
                'circle-opacity': 0.85,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
              }}
            />
          </Source>
        )}

        {/* ── Clustered bubbles mode ─────────────────────────── */}
        {isClustered && (
          <Source
            id="clustered-source"
            type="geojson"
            data={pointsGeoJSON}
            cluster={true}
            clusterRadius={60}
            clusterMaxZoom={14}
            clusterProperties={{
              // sumMinutes is a valid numeric cluster aggregation
              sumMinutes: ['+', ['get', 'idleMinutes']],
            }}
          >
            <Layer
              id="cluster-circles"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-radius': CLUSTER_RADIUS_EXPR,
                'circle-color': '#2563eb',  // hardcoded — MapLibre cannot resolve CSS vars
                'circle-opacity': 0.75,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
              }}
            />
            <Layer
              id="cluster-labels"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': ['get', 'point_count'],
                'text-size': 11,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{ 'text-color': '#fff' }}
            />
            <Layer
              id="individual-circles"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius': 8,
                'circle-color': '#d9a528',
                'circle-opacity': 0.9,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
              }}
            />
          </Source>
        )}

        {/* Pulsing ring on highest-minute cluster */}
        {isClustered && topEvent && (
          <Marker longitude={topEvent.lon!} latitude={topEvent.lat!} anchor="center">
            <div
              className="rounded-full border-2 border-amber-400 pointer-events-none"
              style={{
                width: 52,
                height: 52,
                animation: 'pulse-ring 2s ease-out infinite',
              }}
            />
          </Marker>
        )}

        {/* ── Raw bubbles mode ───────────────────────────────── */}
        {isRaw && (
          <Source id="raw-source" type="geojson" data={pointsGeoJSON}>
            <Layer
              id="raw-circles"
              type="circle"
              paint={{
                'circle-radius': RAW_RADIUS_EXPR,
                'circle-color': '#d9a528',
                'circle-opacity': 0.75,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
              }}
            />
          </Source>
        )}
      </Map>

      {/* ── Empty / no-coords states ───────────────────────── */}
      {isEmpty && !noCoords && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No idling events for this period</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try a different date range</p>
        </div>
      )}

      {noCoords && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No GPS coordinates available</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{events.length} events found but none have location data</p>
        </div>
      )}

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.8; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
