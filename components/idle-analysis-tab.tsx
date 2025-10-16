'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IdleEvent, IdleAggregation, IdleFilters, Driver } from '@/lib/idle-data-types'
import { mockIdleEvents, mockIdleAggregations, mockDrivers, mockGeofences } from '@/lib/mock-idle-data'
import { IdleAnalysisProfessional } from './idle-analysis-professional'

interface IdleAnalysisTabProps {
  isFleetView?: boolean
  vehicleNumber?: string
  customerConfig: any
}

export function IdleAnalysisTab({ isFleetView = true, vehicleNumber, customerConfig }: IdleAnalysisTabProps) {
  const [dateFilter, setDateFilter] = useState<'last-7-days' | 'last-30-days' | 'this-month' | 'last-month' | 'ytd'>('last-30-days')
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([])
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([])
  const [selectedAggregation, setSelectedAggregation] = useState<IdleAggregation | null>(null)
  const [mapView, setMapView] = useState<'aggregated' | 'individual'>('aggregated')

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

  return (
    <IdleAnalysisProfessional 
      isFleetView={isFleetView}
      vehicleNumber={vehicleNumber}
      customerConfig={customerConfig}
    />
  )
}
