'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IdleEvent, IdleAggregation, IdleFilters, Driver } from '@/lib/idle-data-types'
import { mockIdleEvents, mockIdleAggregations, mockDrivers, mockGeofences } from '@/lib/mock-idle-data'
import { IdleMap } from './idle-map-working'
import { IdleEventsTableModal } from './idle-events-table-modal'

interface IdleAnalysisProfessionalProps {
  isFleetView?: boolean
  vehicleNumber?: string
  customerConfig: any
}

export function IdleAnalysisProfessional({ isFleetView = true, vehicleNumber, customerConfig }: IdleAnalysisProfessionalProps) {
  const [dateFilter, setDateFilter] = useState<'last-7-days' | 'last-30-days' | 'this-month' | 'last-month' | 'ytd'>('last-30-days')
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([])
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])
  const [selectedAggregation, setSelectedAggregation] = useState<IdleAggregation | null>(null)
  const [mapView, setMapView] = useState<'aggregated' | 'individual'>('aggregated')
  const [selectedEvent, setSelectedEvent] = useState<IdleEvent | null>(null)
  const [showEventsTable, setShowEventsTable] = useState(false)
  const [tableAggregation, setTableAggregation] = useState<IdleAggregation | null>(null)

  // Filter data based on current selections
  const filterDataByDate = (events: IdleEvent[]) => {
    const now = new Date()
    
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      
      // Filter by vehicle if not fleet view
      if (!isFleetView && vehicleNumber && event.vehicleNumber !== vehicleNumber) {
        return false
      }
      
      // Filter by selected vehicles (fleet view only)
      if (isFleetView && selectedVehicles.length > 0 && !selectedVehicles.includes(event.vehicleNumber)) {
        return false
      }
      
      // Filter by selected drivers
      if (selectedDrivers.length > 0 && !selectedDrivers.includes(event.driverId)) {
        return false
      }
      
      // Filter by date
      switch (dateFilter) {
        case 'last-7-days':
          const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
          return eventDate >= sevenDaysAgo
        case 'last-30-days':
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
          return eventDate >= thirtyDaysAgo
        case 'this-month':
          return eventDate.getFullYear() === now.getFullYear() && eventDate.getMonth() === now.getMonth()
        case 'last-month':
          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
          const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
          return eventDate.getFullYear() === lastMonthYear && eventDate.getMonth() === lastMonth
        case 'ytd':
          return eventDate.getFullYear() === now.getFullYear()
        default:
          return true
      }
    })
  }

  const filteredEvents = filterDataByDate(mockIdleEvents)
  const filteredAggregations = mockIdleAggregations.filter(agg => 
    agg.events.some(event => filteredEvents.includes(event))
  ).map(agg => ({
    ...agg,
    events: agg.events.filter(event => filteredEvents.includes(event)),
    eventCount: agg.events.filter(event => filteredEvents.includes(event)).length,
    totalDuration: agg.events.filter(event => filteredEvents.includes(event)).reduce((sum, e) => sum + e.duration, 0),
    totalFuelConsumed: agg.events.filter(event => filteredEvents.includes(event)).reduce((sum, e) => sum + e.fuelConsumed, 0),
    totalCost: agg.events.filter(event => filteredEvents.includes(event)).reduce((sum, e) => sum + e.cost, 0)
  })).filter(agg => agg.eventCount > 0)

  // Calculate summary statistics
  const totalEvents = filteredEvents.length
  const totalDuration = filteredEvents.reduce((sum, e) => sum + e.duration, 0)
  const totalFuelWasted = filteredEvents.reduce((sum, e) => sum + e.fuelConsumed, 0)
  const totalCost = filteredEvents.reduce((sum, e) => sum + e.cost, 0)
  const avgEventDuration = totalEvents > 0 ? totalDuration / totalEvents : 0

  // Get unique vehicles and drivers for filters
  const availableVehicles = [...new Set(mockIdleEvents.map(e => e.vehicleNumber))].sort()
  const availableDrivers = mockDrivers.sort((a, b) => a.name.localeCompare(b.name))

  const getDateRangeLabel = () => {
    switch (dateFilter) {
      case 'last-7-days': return 'Last 7 Days'
      case 'last-30-days': return 'Last 30 Days'
      case 'this-month': return 'This Month'
      case 'last-month': return 'Last Month'
      case 'ytd': return 'Year to Date'
      default: return 'Last 30 Days'
    }
  }

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-orange-500'
      default: return 'bg-green-500'
    }
  }

  return (
    <div className="h-full flex bg-gray-50 max-w-[90vw] mx-auto">
      {/* Left Sidebar - Minimal & Clean */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Idle Analysis</h2>
          <p className="text-xs text-gray-500 mt-1">
            {isFleetView ? 'Fleet Overview' : `Unit ${vehicleNumber}`}
          </p>
        </div>

        {/* Compact Filters */}
        <div className="p-3 space-y-3">
          {/* Date Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Time Period</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="last-30-days">Last 30 Days</option>
              <option value="last-7-days">Last 7 Days</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="ytd">Year to Date</option>
            </select>
          </div>

          {/* View Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">View Mode</label>
            <div className="flex rounded border border-gray-300 overflow-hidden">
              <button
                onClick={() => setMapView('aggregated')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                  mapView === 'aggregated'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Locations
              </button>
              <button
                onClick={() => setMapView('individual')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                  mapView === 'individual'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Events
              </button>
            </div>
          </div>
        </div>

        {/* Compact List */}
        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          <div className="p-3">
            <h3 className="text-xs font-medium text-gray-600 mb-2">
              {mapView === 'aggregated' ? 'Top Idle Locations' : 'Recent Events'}
            </h3>
            
            <div className="space-y-1">
              {mapView === 'aggregated' ? (
                filteredAggregations.slice(0, 8).map((location, index) => (
                  <div 
                    key={location.geofenceId}
                    className={`p-2 rounded cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedAggregation?.geofenceId === location.geofenceId 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'border border-transparent'
                    }`}
                    onClick={() => setSelectedAggregation(location)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${getSeverityColor(location.severity)}`}></div>
                        <span className="text-xs font-medium text-gray-900 truncate">
                          {location.geofenceName}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs text-gray-500">
                      <div className="text-center">
                        <div className="font-medium text-gray-900 text-xs">{location.eventCount}</div>
                        <div className="text-xs">Events</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-gray-900 text-xs">{location.totalDuration.toFixed(0)}m</div>
                        <div className="text-xs">Time</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-gray-900 text-xs">${location.totalCost.toFixed(0)}</div>
                        <div className="text-xs">Cost</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                filteredEvents.slice(0, 12).map((event) => (
                  <div 
                    key={event.id}
                    className={`p-2 rounded cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedEvent?.id === event.id 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'border border-transparent'
                    }`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${getSeverityColor(event.severity)}`}></div>
                        <span className="text-xs font-medium text-gray-900">
                          Unit {event.vehicleNumber}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {event.startTime.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">{event.driverName}</div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">{event.duration}m</span>
                      <span className="text-gray-900 font-medium">${event.cost.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Map Area - Much Larger */}
      <div className="flex-1 relative">
        <IdleMap
          events={filteredEvents}
          aggregations={filteredAggregations}
          geofences={mockGeofences}
          viewMode={mapView}
          onEventClick={(event) => setSelectedEvent(event)}
          onAggregationClick={(aggregation) => {
            setTableAggregation(aggregation)
            setShowEventsTable(true)
          }}
          customerConfig={customerConfig}
        />
      </div>

      {/* Right Sidebar - Minimal & Clean */}
      <div className="w-56 bg-white border-l border-gray-200 flex flex-col">
        {/* Compact Summary */}
        <div className="p-3 border-b border-gray-100">
          <h3 className="text-xs font-medium text-gray-600 mb-2">Idle Summary</h3>
          <div className="text-xs text-gray-400 mb-2">{getDateRangeLabel()}</div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Total Events</span>
              <span className="text-sm font-bold text-red-600">{totalEvents}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Total Time</span>
              <span className="text-sm font-bold text-orange-600">{Math.round(totalDuration)}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Fuel Wasted</span>
              <span className="text-sm font-bold text-red-600">{totalFuelWasted.toFixed(1)} gal</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Cost Impact</span>
              <span className="text-sm font-bold text-red-600">${totalCost.toFixed(0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Avg Duration</span>
              <span className="text-sm font-bold text-gray-700">{avgEventDuration.toFixed(1)}m</span>
            </div>
          </div>
        </div>

        {/* Compact Map Controls */}
        <div className="p-3 border-b border-gray-100">
          <h3 className="text-xs font-medium text-gray-600 mb-2">Map Base</h3>
          <div className="space-y-1">
            <label className="flex items-center text-xs">
              <input type="radio" name="mapBase" defaultChecked className="mr-1.5 scale-75" />
              <span className="text-gray-700">Default</span>
            </label>
            <label className="flex items-center text-xs">
              <input type="radio" name="mapBase" className="mr-1.5 scale-75" />
              <span className="text-gray-700">Terrain</span>
            </label>
            <label className="flex items-center text-xs">
              <input type="radio" name="mapBase" className="mr-1.5 scale-75" />
              <span className="text-gray-700">Satellite</span>
            </label>
          </div>
        </div>

        <div className="p-3 border-b border-gray-100">
          <h3 className="text-xs font-medium text-gray-600 mb-2">Overlay</h3>
          <div className="space-y-1">
            <label className="flex items-center text-xs">
              <input type="checkbox" defaultChecked className="mr-1.5 scale-75" />
              <span className="text-gray-700">Traffic</span>
            </label>
            <label className="flex items-center text-xs">
              <input type="checkbox" className="mr-1.5 scale-75" />
              <span className="text-gray-700">Weather</span>
            </label>
            <label className="flex items-center text-xs">
              <input type="checkbox" defaultChecked className="mr-1.5 scale-75" />
              <span className="text-gray-700">Idle Events</span>
            </label>
            <label className="flex items-center text-xs">
              <input type="checkbox" defaultChecked className="mr-1.5 scale-75" />
              <span className="text-gray-700">Geofences</span>
            </label>
          </div>
        </div>

        {/* Compact Details */}
        {(selectedEvent || selectedAggregation) && (
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-600">Details</h3>
              <button 
                onClick={() => {
                  setSelectedEvent(null)
                  setSelectedAggregation(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedEvent && (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Vehicle</div>
                  <div className="text-xs font-medium text-gray-900">Unit {selectedEvent.vehicleNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Driver</div>
                  <div className="text-xs font-medium text-gray-900">{selectedEvent.driverName}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Duration</div>
                  <div className="text-xs font-medium text-gray-900">{selectedEvent.duration} minutes</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Fuel Cost</div>
                  <div className="text-xs font-medium text-gray-900">${selectedEvent.cost.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Location</div>
                  <div className="text-xs font-medium text-gray-900">{selectedEvent.geofenceName}</div>
                </div>
              </div>
            )}

            {selectedAggregation && (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Location</div>
                  <div className="text-xs font-medium text-gray-900">{selectedAggregation.geofenceName}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Events</div>
                  <div className="text-xs font-medium text-gray-900">{selectedAggregation.eventCount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Duration</div>
                  <div className="text-xs font-medium text-gray-900">{selectedAggregation.totalDuration.toFixed(0)}m</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">Cost</div>
                  <div className="text-xs font-medium text-gray-900">${selectedAggregation.totalCost.toFixed(2)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Events Table Modal */}
      {showEventsTable && (
        <IdleEventsTableModal
          aggregation={tableAggregation}
          onClose={() => {
            setShowEventsTable(false)
            setTableAggregation(null)
          }}
          customerConfig={customerConfig}
        />
      )}
    </div>
  )
}
