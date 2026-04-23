'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Popup, Source, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Loader2 } from 'lucide-react';

import { hasValidCoords, type EnrichedIdleEvent, type Geofence, type ViewMode, type BubbleMode } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  geofences: Geofence[];
  viewMode: ViewMode;
  bubbleMode: BubbleMode;
  geofenceVisible: boolean;
  loading: boolean;
  flyToCoords: { lat: number; lon: number } | null;
  onEventClick: (eventId: string) => void;
  onClusterClick: (groupKey: string) => void;
  onClusterEventsClick: (eventIds: string[]) => void;
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
      .filter(hasValidCoords)
      .map(e => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
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
  flyToCoords,
  onEventClick,
  onClusterClick,
  onClusterEventsClick,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = useMapTheme();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [geofenceTooltip, setGeofenceTooltip] = useState<{ lng: number; lat: number; name: string; category: string | null } | null>(null);

  const eventsWithCoords = useMemo(() => events.filter(hasValidCoords), [events]);

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

  const [highlightCoords, setHighlightCoords] = useState<{ lat: number; lon: number } | null>(null);

  const highlightGeoJSON = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: highlightCoords ? [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [highlightCoords.lon, highlightCoords.lat] },
      properties: {},
    }] : [],
  }), [highlightCoords]);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
  }, []);

  useEffect(() => {
    if (!flyToCoords || !mapRef.current) return;
    mapRef.current.getMap().flyTo({ center: [flyToCoords.lon, flyToCoords.lat], zoom: 18 });
    setHighlightCoords(flyToCoords);
  }, [flyToCoords]);

  // Fit camera to events when both map and events are ready.
  // Uses map.once('idle') to defer until basemap tiles are loaded, avoiding a race condition
  // where fitBounds is called before the style is ready and the camera change is ignored.
  // Named handler is stored so the useEffect cleanup can remove it if events change before idle fires.
  useEffect(() => {
    if (!mapLoaded || eventsWithCoords.length === 0 || !mapRef.current) return;

    const map = mapRef.current.getMap();
    const lngs = eventsWithCoords.map(e => e.lon);
    const lats = eventsWithCoords.map(e => e.lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Treat near-zero bounding boxes (tight clusters / single point) as degenerate
    const isDegenerate = Math.abs(maxLng - minLng) < 0.005 && Math.abs(maxLat - minLat) < 0.005;

    const handler = () => {
      if (!mapRef.current) return;
      try {
        if (isDegenerate) {
          // easeTo a fixed zoom instead of fitBounds which would zoom in to ~18
          map.easeTo({
            center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
            zoom: 13,
            duration: 1200,
          });
        } else {
          mapRef.current.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 80, maxZoom: 13, duration: 1200 }
          );
        }
      } catch {
        // ignore if map was unmounted
      }
    };

    map.once('idle', handler);
    return () => { map.off('idle', handler); };
  }, [mapLoaded, eventsWithCoords.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (!mapRef.current) { setGeofenceTooltip(null); return; }
    const map = mapRef.current.getMap();

    // Clear fly-to highlight when hovering over any event bubble
    const bubbleLayers = ['cluster-circles', 'individual-circles', 'raw-circles', 'heatmap-circles'].filter(id => {
      try { return !!map.getLayer(id); } catch { return false; }
    });
    if (bubbleLayers.length > 0 && map.queryRenderedFeatures(e.point, { layers: bubbleLayers }).length > 0) {
      setHighlightCoords(null);
    }

    if (!geofenceVisible) { setGeofenceTooltip(null); return; }
    if (!map.getLayer('geofence-fill')) { setGeofenceTooltip(null); return; }
    const features = map.queryRenderedFeatures(e.point, { layers: ['geofence-fill'] });
    if (features.length > 0) {
      const props = features[0]!.properties as any;
      setGeofenceTooltip({ lng: e.lngLat.lng, lat: e.lngLat.lat, name: props.name ?? '', category: props.category ?? null });
    } else {
      setGeofenceTooltip(null);
    }
  }, [geofenceVisible]);

  const handleMouseLeave = useCallback(() => setGeofenceTooltip(null), []);

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!mapRef.current) return;
      const map = mapRef.current.getMap();

      if (isClustered) {
        const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: ['cluster-circles'] });
        if (clusterFeatures.length > 0) {
          const f = clusterFeatures[0]!;
          const clusterId = (f.properties as any).cluster_id;
          const pointCount: number = (f.properties as any).point_count ?? 0;
          const source = map.getSource('clustered-source') as any;
          source.getClusterLeaves(clusterId, Math.min(pointCount, 2000), 0)
            .then((leaves: any[]) => {
              if (!leaves || leaves.length === 0) { onClusterClick(''); return; }
              const ids = leaves.map((l: any) => String(l.properties?.id ?? '')).filter(Boolean);
              if (ids.length > 0) onClusterEventsClick(ids);
              else onClusterClick('');
            })
            .catch(() => onClusterClick(''));
          return;
        }
        const individualFeatures = map.queryRenderedFeatures(e.point, { layers: ['individual-circles'] });
        if (individualFeatures.length > 0) {
          const id = String((individualFeatures[0]!.properties as any).id ?? '');
          if (id) onEventClick(id);
          return;
        }
      }

      if (isRaw) {
        const features = map.queryRenderedFeatures(e.point, { layers: ['raw-circles'] });
        if (features.length > 0) {
          onEventClick(String((features[0]!.properties as any).id ?? ''));
        }
        return;
      }

      if (isHeatmap) {
        // Only individual circles (zoom ≥ 13) are clickable — the heatmap density layer
        // doesn't expose per-event data, so we don't attempt to hit-test it.
        const circleFeatures = map.queryRenderedFeatures(e.point, { layers: ['heatmap-circles'] });
        if (circleFeatures.length > 0) {
          const id = String((circleFeatures[0]!.properties as any).id ?? '');
          if (id) onEventClick(id);
        }
      }
    },
    [isClustered, isRaw, isHeatmap, onEventClick, onClusterClick, onClusterEventsClick]
  );

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={{ longitude: -83, latitude: 42, zoom: 6 }}
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        attributionControl={false}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={
          isClustered
            ? ['cluster-circles', 'individual-circles']
            : isRaw
            ? ['raw-circles']
            : ['heatmap-circles']
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
                'text-field': ['number-format', ['get', 'point_count'], { locale: 'en-US' }] as ExpressionSpecification,
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

        {/* ── Fly-to highlight marker ────────────────────────── */}
        <Source id="highlight-source" type="geojson" data={highlightGeoJSON}>
          <Layer
            id="highlight-ring"
            type="circle"
            paint={{
              'circle-radius': 20,
              'circle-color': '#f97316',
              'circle-opacity': 0.3,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#f97316',
              'circle-stroke-opacity': 0.9,
            }}
          />
          <Layer
            id="highlight-dot"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#f97316',
              'circle-opacity': 1,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#fff',
            }}
          />
        </Source>

        {geofenceTooltip && (
          <Popup
            longitude={geofenceTooltip.lng}
            latitude={geofenceTooltip.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={12}
            className="!p-0 !bg-transparent !shadow-none !border-none"
          >
            <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs pointer-events-none">
              <p className="font-semibold text-foreground">{geofenceTooltip.name}</p>
              {geofenceTooltip.category && (
                <p className="text-muted-foreground mt-0.5">{geofenceTooltip.category}</p>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {/* ── Loading spinner ───────────────────────────────── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px] pointer-events-none">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

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
          <p className="text-xs text-muted-foreground/60 mt-1">{events.length.toLocaleString('en-US')} events found but none have location data</p>
        </div>
      )}

    </div>
  );
}
