'use client'

import { useState, useEffect, useCallback } from 'react'
import { FleetVehicle, MaintenanceRecord } from '@/lib/customer-data-service'
import { CustomerConfig } from '@/lib/customer-config'
import { useLoadingManager, LOADING_IDS, LOADING_MESSAGES, LoadingCategory, LoadingPriority } from '@/lib/state/loading-manager'
import { ErrorClassifier } from '@/lib/errors/error-classifier'
import { reportError } from '@/lib/errors/error-reporter'

interface UseFleetDataReturn {
  fleetData: FleetVehicle[]
  maintenanceData: MaintenanceRecord[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Custom hook for fetching and managing fleet data
 * Provides memoized data fetching with error handling and loading states
 */
export function useFleetData(
  dataService: any, 
  customerConfig: CustomerConfig | null
): UseFleetDataReturn {
  const [fleetData, setFleetData] = useState<FleetVehicle[]>([])
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Simplified data fetching without complex loading manager
  const fetchData = useCallback(async () => {
    console.log('useFleetData: Starting simple fetch...')
    
    if (!dataService || !customerConfig) {
      console.log('useFleetData: No dataService or customerConfig, using empty data')
      setFleetData([])
      setMaintenanceData([])
      setLoading(false)
      return
    }

    // Additional safety check
    if (typeof dataService.getCustomerFleetData !== 'function' || 
        typeof dataService.getCustomerMaintenanceData !== 'function') {
      console.warn('useFleetData: DataService methods not available, using empty data')
      setFleetData([])
      setMaintenanceData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      console.log('useFleetData: Calling dataService methods...')
      
      // Simple Promise.all without complex loading manager
      const [fleet, maintenance] = await Promise.all([
        dataService.getCustomerFleetData(),
        dataService.getCustomerMaintenanceData()
      ])
      
      console.log('useFleetData: Data received - Fleet:', fleet?.length || 0, 'Maintenance:', maintenance?.length || 0)
      
      setFleetData(fleet || [])
      setMaintenanceData(maintenance || [])
    } catch (err) {
      console.error('useFleetData: Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
      // Set empty data on error
      setFleetData([])
      setMaintenanceData([])
    } finally {
      console.log('useFleetData: Fetch complete, setting loading to false')
      setLoading(false)
    }
  }, [dataService, customerConfig])

  // Load data when dependencies change
  useEffect(() => {
    console.log('useFleetData: useEffect triggered')
    fetchData()
  }, [fetchData])

  return {
    fleetData,
    maintenanceData,
    loading,
    error,
    refetch: fetchData
  }
}

/**
 * Custom hook for fleet statistics calculations
 * Memoizes expensive calculations to prevent unnecessary re-renders
 */
export function useFleetStats(fleetData: FleetVehicle[], maintenanceData: MaintenanceRecord[]) {
  const [stats, setStats] = useState({
    activeVehicles: 0,
    maintenanceVehicles: 0,
    totalVehicles: 0,
    utilizationRate: 0,
    upcomingMaintenance: 0,
    recentMaintenanceData: [] as MaintenanceRecord[]
  })

  useEffect(() => {
    const active = fleetData.filter(v => v.status === 'active').length
    const maintenance = fleetData.filter(v => v.status === 'maintenance').length
    const total = fleetData.length
    const utilizationRate = total > 0 ? (active / total) * 100 : 0
    
    // Calculate upcoming maintenance
    const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const upcomingMaintenance = maintenanceData.filter(m => 
      m.status === 'scheduled' && new Date(m.date) <= oneWeekFromNow
    ).length

    // Calculate recent maintenance (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentMaintenanceData = maintenanceData
      .filter(m => new Date(m.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)

    setStats({
      activeVehicles: active,
      maintenanceVehicles: maintenance,
      totalVehicles: total,
      utilizationRate,
      upcomingMaintenance,
      recentMaintenanceData
    })
  }, [fleetData, maintenanceData])

  return stats
}
