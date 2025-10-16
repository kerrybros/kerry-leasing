'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import Map, { Marker, Popup, Source, Layer, MapRef } from 'react-map-gl'
import { IdleEvent, IdleAggregation, Geofence } from '@/lib/idle-data-types'
import { Button } from '@/components/ui/button'

// Mapbox access token - temporarily hardcoded for testing
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoia2Vycnlicm9zIiwiYSI6ImNtZTc0dWFxMjAwc2gybHB5NzAxbzZwa2MifQ.yAubuLKrB_GS_fy4uaI2Lw'

// Debug logging
if (typeof window !== 'undefined') {
  console.log('Mapbox token check:', MAPBOX_TOKEN ? 'Token found' : 'No token', MAPBOX_TOKEN?.substring(0, 20) + '...')
}

interface IdleMapProps {
  events: IdleEvent[]
  aggregations: IdleAggregation[]
  geofences: Geofence[]
  viewMode: 'aggregated' | 'individual'
  onEventClick?: (event: IdleEvent) => void
  onAggregationClick?: (aggregation: IdleAggregation) => void
  customerConfig: any
}

export function IdleMap({ 
  events, 
  aggregations, 
  geofences, 
  viewMode, 
  onEventClick, 
  onAggregationClick,
  customerConfig 
}: IdleMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [selectedEvent, setSelectedEvent] = useState<IdleEvent | null>(null)
  const [selectedAggregation, setSelectedAggregation] = useState<IdleAggregation | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showGeofences, setShowGeofences] = useState(true)
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite' | 'dark'>('streets')
  const [viewState, setViewState] = useState({
    longitude: -83.0458,
    latitude: 42.3314,
    zoom: 11
  })

  // Create heatmap data
  const heatmapData = useMemo(() => {
    const features = events.map(event => ({
      type: 'Feature' as const,
      properties: {
        weight: event.duration / 60 // Use duration in hours as weight
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [event.coordinates.longitude, event.coordinates.latitude]
      }
    }))

    return {
      type: 'FeatureCollection' as const,
      features
    }
  }, [events])

  // Create geofence data
  const geofenceData = useMemo(() => {
    const features = geofences.map(geofence => ({
      type: 'Feature' as const,
      properties: {
        id: geofence.id,
        name: geofence.name,
        type: geofence.type,
        color: geofence.color,
        allowedIdleTime: geofence.allowedIdleTime
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [geofence.coordinates]
      }
    }))

    return {
      type: 'FeatureCollection' as const,
      features
    }
  }, [geofences])

  const getMapStyle = () => {
    switch (mapStyle) {
      case 'satellite': return 'mapbox://styles/mapbox/satellite-streets-v12'
      case 'dark': return 'mapbox://styles/mapbox/dark-v11'
      default: return 'mapbox://styles/mapbox/streets-v12'
    }
  }

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return '#EF4444'
      case 'medium': return '#F59E0B'
      default: return '#10B981'
    }
  }

  const handleMarkerClick = useCallback((item: IdleEvent | IdleAggregation) => {
    if ('eventCount' in item) {
      setSelectedAggregation(item)
      onAggregationClick?.(item)
    } else {
      setSelectedEvent(item)
      onEventClick?.(item)
    }
  }, [onEventClick, onAggregationClick])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-4xl mb-4">🗺️</div>
          <h3 className="text-xl font-semibold text-slate-700 mb-2">Mapbox Token Required</h3>
          <p className="text-slate-500">Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to your .env.local file</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-10 space-y-2">
        {/* Layer Controls */}
        <div className="bg-white rounded-lg shadow-lg p-3 space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Layers</h4>
          
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showGeofences}
              onChange={(e) => setShowGeofences(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mr-2"
            />
            Geofences
          </label>
          
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mr-2"
            />
            Heatmap
          </label>
        </div>

        {/* Map Style Selector */}
        <div className="bg-white rounded-lg shadow-lg p-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Map Style</h4>
          <div className="space-y-1">
            {[
              { key: 'streets', label: 'Streets' },
              { key: 'satellite', label: 'Satellite' },
              { key: 'dark', label: 'Dark' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMapStyle(key as any)}
                className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                  mapStyle === key 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow-lg p-3">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Legend</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
              <span>Low Idle (&lt;15min)</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
              <span>Medium Idle (15-30min)</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span>High Idle (&gt;30min)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getMapStyle()}
        interactiveLayerIds={showGeofences ? ['geofence-fill'] : []}
      >
        {/* Geofences */}
        {showGeofences && (
          <Source id="geofences" type="geojson" data={geofenceData}>
            <Layer
              id="geofence-fill"
              type="fill"
              paint={{
                'fill-color': ['get', 'color'],
                'fill-opacity': 0.2
              }}
            />
            <Layer
              id="geofence-line"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-opacity': 0.8
              }}
            />
          </Source>
        )}

        {/* Heatmap */}
        {showHeatmap && (
          <Source id="idle-heatmap" type="geojson" data={heatmapData}>
            <Layer
              id="idle-heatmap-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': ['get', 'weight'],
                'heatmap-intensity': 1,
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(33,102,172,0)',
                  0.2, 'rgb(103,169,207)',
                  0.4, 'rgb(209,229,240)',
                  0.6, 'rgb(253,219,199)',
                  0.8, 'rgb(239,138,98)',
                  1, 'rgb(178,24,43)'
                ],
                'heatmap-radius': 20,
                'heatmap-opacity': 0.7
              }}
            />
          </Source>
        )}

        {/* Aggregated View - Location Bubbles */}
        {viewMode === 'aggregated' && aggregations.map(aggregation => (
          <Marker
            key={aggregation.geofenceId}
            longitude={aggregation.coordinates[0]}
            latitude={aggregation.coordinates[1]}
          >
            <div 
              className="cursor-pointer transform hover:scale-110 transition-transform"
              onClick={() => handleMarkerClick(aggregation)}
              style={{
                width: Math.max(30, Math.min(80, aggregation.eventCount * 8)),
                height: Math.max(30, Math.min(80, aggregation.eventCount * 8))
              }}
            >
              <div 
                className="w-full h-full rounded-full flex items-center justify-center text-white font-bold shadow-lg border-4 border-white"
                style={{ backgroundColor: getSeverityColor(aggregation.severity) }}
              >
                <div className="text-center">
                  <div className="text-xs leading-none">{aggregation.eventCount}</div>
                  <div className="text-xs leading-none opacity-80">events</div>
                </div>
              </div>
            </div>
          </Marker>
        ))}

        {/* Individual View - Event Markers */}
        {viewMode === 'individual' && events.slice(0, 100).map(event => ( // Limit to 100 for performance
          <Marker
            key={event.id}
            longitude={event.coordinates.longitude}
            latitude={event.coordinates.latitude}
          >
            <div 
              className="cursor-pointer transform hover:scale-110 transition-transform"
              onClick={() => handleMarkerClick(event)}
            >
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                style={{ backgroundColor: getSeverityColor(event.severity) }}
              >
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
            </div>
          </Marker>
        ))}

        {/* Event Popup */}
        {selectedEvent && (
          <Popup
            longitude={selectedEvent.coordinates.longitude}
            latitude={selectedEvent.coordinates.latitude}
            onClose={() => setSelectedEvent(null)}
            closeButton={true}
            closeOnClick={false}
            className="idle-event-popup"
          >
            <div className="p-3 min-w-64">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900">Idle Event</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedEvent.severity === 'high' ? 'bg-red-100 text-red-800' :
                  selectedEvent.severity === 'medium' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                }`}>
                  {selectedEvent.severity}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-600">Vehicle:</span>
                    <div className="font-medium">Unit {selectedEvent.vehicleNumber}</div>
                  </div>
                  <div>
                    <span className="text-slate-600">Driver:</span>
                    <div className="font-medium">{selectedEvent.driverName}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-600">Duration:</span>
                    <div className="font-medium">{selectedEvent.duration} minutes</div>
                  </div>
                  <div>
                    <span className="text-slate-600">Fuel Cost:</span>
                    <div className="font-medium">${selectedEvent.cost.toFixed(2)}</div>
                  </div>
                </div>
                
                <div>
                  <span className="text-slate-600">Location:</span>
                  <div className="font-medium">{selectedEvent.geofenceName || selectedEvent.address}</div>
                </div>
                
                <div>
                  <span className="text-slate-600">Time:</span>
                  <div className="font-medium">
                    {selectedEvent.startTime.toLocaleString()} - {selectedEvent.endTime.toLocaleString()}
                  </div>
                </div>
                
                {selectedEvent.reason && (
                  <div>
                    <span className="text-slate-600">Reason:</span>
                    <div className="font-medium italic">{selectedEvent.reason}</div>
                  </div>
                )}
              </div>
            </div>
          </Popup>
        )}

        {/* Aggregation Popup */}
        {selectedAggregation && (
          <Popup
            longitude={selectedAggregation.coordinates[0]}
            latitude={selectedAggregation.coordinates[1]}
            onClose={() => setSelectedAggregation(null)}
            closeButton={true}
            closeOnClick={false}
            className="idle-aggregation-popup"
          >
            <div className="p-4 min-w-72 bg-white rounded-lg shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-base">{selectedAggregation.geofenceName}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedAggregation.severity === 'high' ? 'bg-red-100 text-red-800' :
                  selectedAggregation.severity === 'medium' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                }`}>
                  {selectedAggregation.severity}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-gray-900">{selectedAggregation.eventCount}</div>
                  <div className="text-xs text-gray-600">Events</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-gray-900">{selectedAggregation.totalDuration.toFixed(0)}m</div>
                  <div className="text-xs text-gray-600">Total Time</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-gray-900">${selectedAggregation.totalCost.toFixed(0)}</div>
                  <div className="text-xs text-gray-600">Fuel Cost</div>
                </div>
              </div>
              
              <div className="space-y-2 text-sm mb-4">
                <div>
                  <span className="text-gray-600 font-medium">Vehicles Involved:</span>
                  <div className="text-gray-900 mt-1">{selectedAggregation.vehicles.join(', ')}</div>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Drivers:</span>
                  <div className="text-gray-900 mt-1">{selectedAggregation.drivers.join(', ')}</div>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Fuel Wasted:</span>
                  <div className="text-gray-900 mt-1">{selectedAggregation.totalFuelConsumed.toFixed(1)} gallons</div>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                size="sm"
                onClick={() => {
                  onAggregationClick?.(selectedAggregation)
                  setSelectedAggregation(null)
                }}
              >
                View All Events
              </Button>
            </div>
          </Popup>
        )}
      </Map>

      {/* Map Attribution */}
      <div className="absolute bottom-2 left-2 text-xs text-slate-500 bg-white bg-opacity-75 px-2 py-1 rounded">
        © Mapbox © OpenStreetMap
      </div>
    </div>
  )
}
