/**
 * Tests for useFleetData hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFleetData, useFleetStats } from '@/lib/hooks/use-fleet-data'
import { mockCustomerConfig, mockFleetVehicle, mockMaintenanceRecord } from '@/test/utils/test-utils'

// Mock the data service
const mockDataService = {
  getCustomerFleetData: vi.fn(),
  getCustomerMaintenanceData: vi.fn(),
}

// Mock the loading manager
vi.mock('@/lib/state/loading-manager', () => ({
  useLoadingManager: () => ({
    withLoading: vi.fn((id, message, fn) => fn()),
  }),
  LOADING_IDS: { FLEET_DATA: 'fleet_data' },
  LOADING_MESSAGES: { FLEET_DATA: 'Loading fleet data...' },
  LoadingCategory: { DATA_FETCH: 'DATA_FETCH' },
  LoadingPriority: { HIGH: 'HIGH' },
}))

// Mock error handling
vi.mock('@/lib/errors/error-classifier', () => ({
  ErrorClassifier: {
    classify: vi.fn(() => ({
      userMessage: 'Test error message',
    })),
  },
}))

vi.mock('@/lib/errors/error-reporter', () => ({
  reportError: vi.fn(),
}))

describe('useFleetData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads fleet and maintenance data successfully', async () => {
    const mockFleetData = [mockFleetVehicle(), mockFleetVehicle({ id: 'vehicle-2', vehicleNumber: '002' })]
    const mockMaintenanceData = [mockMaintenanceRecord(), mockMaintenanceRecord({ id: 'maintenance-2' })]

    mockDataService.getCustomerFleetData.mockResolvedValue(mockFleetData)
    mockDataService.getCustomerMaintenanceData.mockResolvedValue(mockMaintenanceData)

    const { result } = renderHook(() => 
      useFleetData(mockDataService, mockCustomerConfig)
    )

    // Initially loading
    expect(result.current.loading).toBe(true)
    expect(result.current.fleetData).toEqual([])
    expect(result.current.maintenanceData).toEqual([])

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.fleetData).toEqual(mockFleetData)
    expect(result.current.maintenanceData).toEqual(mockMaintenanceData)
    expect(result.current.error).toBeNull()
  })

  it('handles loading state correctly', async () => {
    mockDataService.getCustomerFleetData.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve([]), 100))
    )
    mockDataService.getCustomerMaintenanceData.mockResolvedValue([])

    const { result } = renderHook(() => 
      useFleetData(mockDataService, mockCustomerConfig)
    )

    expect(result.current.loading).toBe(true)
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('handles errors gracefully', async () => {
    const error = new Error('Failed to fetch data')
    mockDataService.getCustomerFleetData.mockRejectedValue(error)
    mockDataService.getCustomerMaintenanceData.mockRejectedValue(error)

    const { result } = renderHook(() => 
      useFleetData(mockDataService, mockCustomerConfig)
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Test error message')
    expect(result.current.fleetData).toEqual([])
    expect(result.current.maintenanceData).toEqual([])
  })

  it('does not fetch when dataService is null', () => {
    const { result } = renderHook(() => 
      useFleetData(null, mockCustomerConfig)
    )

    expect(result.current.loading).toBe(false)
    expect(mockDataService.getCustomerFleetData).not.toHaveBeenCalled()
    expect(mockDataService.getCustomerMaintenanceData).not.toHaveBeenCalled()
  })

  it('does not fetch when customerConfig is null', () => {
    const { result } = renderHook(() => 
      useFleetData(mockDataService, null)
    )

    expect(result.current.loading).toBe(false)
    expect(mockDataService.getCustomerFleetData).not.toHaveBeenCalled()
    expect(mockDataService.getCustomerMaintenanceData).not.toHaveBeenCalled()
  })

  it('provides refetch functionality', async () => {
    mockDataService.getCustomerFleetData.mockResolvedValue([])
    mockDataService.getCustomerMaintenanceData.mockResolvedValue([])

    const { result } = renderHook(() => 
      useFleetData(mockDataService, mockCustomerConfig)
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Clear previous calls
    vi.clearAllMocks()

    // Call refetch
    await result.current.refetch()

    expect(mockDataService.getCustomerFleetData).toHaveBeenCalledTimes(1)
    expect(mockDataService.getCustomerMaintenanceData).toHaveBeenCalledTimes(1)
  })
})

describe('useFleetStats', () => {
  it('calculates fleet statistics correctly', () => {
    const fleetData = [
      mockFleetVehicle({ status: 'active' }),
      mockFleetVehicle({ id: 'vehicle-2', status: 'active' }),
      mockFleetVehicle({ id: 'vehicle-3', status: 'maintenance' }),
      mockFleetVehicle({ id: 'vehicle-4', status: 'inactive' }),
    ]

    const maintenanceData = [
      mockMaintenanceRecord({ status: 'scheduled', date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }), // 3 days from now
      mockMaintenanceRecord({ id: 'maintenance-2', status: 'scheduled', date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) }), // 10 days from now
      mockMaintenanceRecord({ id: 'maintenance-3', status: 'completed', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }), // 10 days ago
    ]

    const { result } = renderHook(() => 
      useFleetStats(fleetData, maintenanceData)
    )

    expect(result.current.totalVehicles).toBe(4)
    expect(result.current.activeVehicles).toBe(2)
    expect(result.current.maintenanceVehicles).toBe(1)
    expect(result.current.utilizationRate).toBe(50) // 2/4 * 100
    expect(result.current.upcomingMaintenance).toBe(1) // only 1 within 7 days
    expect(result.current.recentMaintenanceData).toHaveLength(1) // only 1 within 30 days
  })

  it('handles empty data gracefully', () => {
    const { result } = renderHook(() => 
      useFleetStats([], [])
    )

    expect(result.current.totalVehicles).toBe(0)
    expect(result.current.activeVehicles).toBe(0)
    expect(result.current.maintenanceVehicles).toBe(0)
    expect(result.current.utilizationRate).toBe(0)
    expect(result.current.upcomingMaintenance).toBe(0)
    expect(result.current.recentMaintenanceData).toEqual([])
  })

  it('limits recent maintenance to 5 items', () => {
    const maintenanceData = Array.from({ length: 10 }, (_, i) => 
      mockMaintenanceRecord({ 
        id: `maintenance-${i}`, 
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // i days ago
      })
    )

    const { result } = renderHook(() => 
      useFleetStats([], maintenanceData)
    )

    expect(result.current.recentMaintenanceData).toHaveLength(5)
  })

  it('sorts recent maintenance by date descending', () => {
    const maintenanceData = [
      mockMaintenanceRecord({ id: 'old', date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }),
      mockMaintenanceRecord({ id: 'recent', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }),
      mockMaintenanceRecord({ id: 'newest', date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }),
    ]

    const { result } = renderHook(() => 
      useFleetStats([], maintenanceData)
    )

    const recentIds = result.current.recentMaintenanceData.map(r => r.id)
    expect(recentIds).toEqual(['newest', 'recent', 'old'])
  })
})
