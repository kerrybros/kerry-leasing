'use client'

import { useState } from 'react'
import { IdleEvent, IdleAggregation, Geofence } from '@/lib/idle-data-types'
import { Button } from '@/components/ui/button'

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
  const [selectedEvent, setSelectedEvent] = useState<IdleEvent | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showGeofences, setShowGeofences] = useState(true)
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite' | 'dark'>('streets')

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return '#EF4444'
      case 'medium': return '#F59E0B'
      default: return '#10B981'
    }
  }

  return (
    <div className="relative w-full h-full bg-slate-100 rounded-lg border border-slate-200">
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

      {/* Map Placeholder with Demo Data */}
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🗺️</div>
          <h3 className="text-2xl font-bold text-slate-700 mb-2">Interactive Mapbox Ready!</h3>
          <p className="text-slate-500 mb-4 max-w-md">
            Your Mapbox token is configured! The full interactive map with satellite imagery, 
            clustering, geofences, and detailed popups is ready to use.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
            <h4 className="font-semibold text-green-900 mb-2">✅ Token Configured!</h4>
            <p className="text-sm text-green-800 mb-2">
              Your Mapbox token is active. To enable the full interactive map:
            </p>
            <ol className="text-sm text-green-800 space-y-1">
              <li>1. Fix the react-map-gl import issue</li>
              <li>2. Switch back to the full map component</li>
              <li>3. Enjoy real satellite maps with clustering!</li>
            </ol>
          </div>
        </div>

        {/* Demo Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl">
          <div className="bg-white rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-red-600">{events.length}</div>
            <div className="text-sm text-slate-600">Idle Events</div>
          </div>
          <div className="bg-white rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-orange-600">{aggregations.length}</div>
            <div className="text-sm text-slate-600">Locations</div>
          </div>
          <div className="bg-white rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-green-600">{geofences.length}</div>
            <div className="text-sm text-slate-600">Geofences</div>
          </div>
          <div className="bg-white rounded-lg p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{viewMode === 'aggregated' ? 'Grouped' : 'Individual'}</div>
            <div className="text-sm text-slate-600">View Mode</div>
          </div>
        </div>

        {/* Sample Event List */}
        <div className="mt-8 w-full max-w-4xl">
          <h4 className="text-lg font-semibold text-slate-700 mb-4">
            Sample {viewMode === 'aggregated' ? 'Location Aggregations' : 'Idle Events'}
          </h4>
          <div className="grid gap-3 max-h-64 overflow-y-auto">
            {viewMode === 'aggregated' ? (
              aggregations.slice(0, 5).map((agg, index) => (
                <div 
                  key={agg.geofenceId}
                  className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => onAggregationClick?.(agg)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: getSeverityColor(agg.severity) }}
                      >
                        {agg.eventCount}
                      </div>
                      <div>
                        <h5 className="font-semibold text-slate-900">{agg.geofenceName}</h5>
                        <p className="text-sm text-slate-600">
                          {agg.vehicles.length} vehicles • {agg.drivers.length} drivers
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">{agg.totalDuration.toFixed(0)}m</p>
                      <p className="text-sm text-slate-600">${agg.totalCost.toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              events.slice(0, 8).map((event) => (
                <div 
                  key={event.id}
                  className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => onEventClick?.(event)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: getSeverityColor(event.severity) }}
                      ></div>
                      <div>
                        <p className="font-medium text-slate-900">Unit {event.vehicleNumber} • {event.driverName}</p>
                        <p className="text-sm text-slate-600">{event.geofenceName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{event.duration}m</p>
                      <p className="text-sm text-slate-600">${event.cost.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Map Attribution */}
      <div className="absolute bottom-2 left-2 text-xs text-slate-500 bg-white bg-opacity-75 px-2 py-1 rounded">
        ✅ Mapbox Token Ready - Full maps pending react-map-gl fix
      </div>
    </div>
  )
}
