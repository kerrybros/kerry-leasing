'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IdleEvent, IdleAggregation } from '@/lib/idle-data-types'

interface IdleEventsTableModalProps {
  aggregation: IdleAggregation | null
  onClose: () => void
  customerConfig: any
}

export function IdleEventsTableModal({ aggregation, onClose, customerConfig }: IdleEventsTableModalProps) {
  const [sortBy, setSortBy] = useState<'date' | 'duration' | 'cost' | 'vehicle'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  if (!aggregation) return null

  const sortedEvents = [...aggregation.events].sort((a, b) => {
    let comparison = 0
    
    switch (sortBy) {
      case 'date':
        comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        break
      case 'duration':
        comparison = a.duration - b.duration
        break
      case 'cost':
        comparison = a.cost - b.cost
        break
      case 'vehicle':
        comparison = a.vehicleNumber.localeCompare(b.vehicleNumber)
        break
    }
    
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-orange-100 text-orange-800'
      default: return 'bg-green-100 text-green-800'
    }
  }

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900" style={{ color: customerConfig.branding.primaryColor }}>
                Idle Events - {aggregation.geofenceName}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {aggregation.eventCount} events • {aggregation.totalDuration.toFixed(0)} minutes total • ${aggregation.totalCost.toFixed(2)} fuel cost
              </p>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="p-6 border-b border-gray-100">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{aggregation.eventCount}</div>
                <div className="text-sm text-gray-600">Total Events</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{aggregation.totalDuration.toFixed(0)}m</div>
                <div className="text-sm text-gray-600">Total Duration</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{aggregation.totalFuelConsumed.toFixed(1)} gal</div>
                <div className="text-sm text-gray-600">Fuel Wasted</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">${aggregation.totalCost.toFixed(2)}</div>
                <div className="text-sm text-gray-600">Cost Impact</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-2">
                    Date & Time
                    {getSortIcon('date')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('vehicle')}
                >
                  <div className="flex items-center gap-2">
                    Vehicle
                    {getSortIcon('vehicle')}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('duration')}
                >
                  <div className="flex items-center gap-2">
                    Duration
                    {getSortIcon('duration')}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cost')}
                >
                  <div className="flex items-center gap-2">
                    Fuel Cost
                    {getSortIcon('cost')}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedEvents.map((event, index) => (
                <tr key={event.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {event.startTime.toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500">
                      {event.startTime.toLocaleTimeString()} - {event.endTime.toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">Unit {event.vehicleNumber}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{event.driverName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{event.duration} min</div>
                    <div className="text-sm text-gray-500">{event.fuelConsumed.toFixed(1)} gal</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">${event.cost.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                      {event.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 italic">
                      {event.reason || 'Unknown'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {sortedEvents.length} idle events from {aggregation.geofenceName}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => {
                // Export functionality could go here
                console.log('Export data:', sortedEvents)
              }}>
                Export Data
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
