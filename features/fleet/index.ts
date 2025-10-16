// Fleet feature exports
export { useFleetVehicles, useFleetVehicle, useVehicleWithMaintenance } from '@/lib/hooks/use-api'
export { useFleetStore } from '@/lib/stores/fleet-store'
export { FleetVehicleSchema, type FleetVehicle } from '@/lib/schemas'
export { FleetErrorBoundary } from '@/lib/components/error-boundary'

// Import types for local use
import type { FleetVehicle } from '@/lib/schemas'

// Fleet-specific types
export interface FleetDashboardProps {
  customerId: string
}

export interface VehicleListProps {
  vehicles: FleetVehicle[]
  onVehicleSelect?: (vehicle: FleetVehicle) => void
  loading?: boolean
}

export interface VehicleCardProps {
  vehicle: FleetVehicle
  onClick?: () => void
  showActions?: boolean
}

// Fleet utilities
export const fleetUtils = {
  getStatusColor: (status: FleetVehicle['status']) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      maintenance: 'bg-yellow-100 text-yellow-800', 
      in_service: 'bg-orange-100 text-orange-800',
      out_of_service: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  },

  calculateUtilization: (vehicles: FleetVehicle[]) => {
    const activeVehicles = vehicles.filter(v => v.status === 'active')
    return {
      total: vehicles.length,
      active: activeVehicles.length,
      utilization: vehicles.length > 0 ? (activeVehicles.length / vehicles.length) * 100 : 0
    }
  },

  sortVehicles: (vehicles: FleetVehicle[], sortBy: keyof FleetVehicle, order: 'asc' | 'desc' = 'asc') => {
    return [...vehicles].sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]
      
      // Handle undefined values
      if (aVal === undefined && bVal === undefined) return 0
      if (aVal === undefined) return order === 'asc' ? 1 : -1
      if (bVal === undefined) return order === 'asc' ? -1 : 1
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1
      if (aVal > bVal) return order === 'asc' ? 1 : -1
      return 0
    })
  },

  filterVehicles: (vehicles: FleetVehicle[], filters: {
    status?: FleetVehicle['status'][]
    search?: string
    makeModel?: string
  }) => {
    return vehicles.filter(vehicle => {
      // Status filter
      if (filters.status && filters.status.length > 0) {
        if (!filters.status.includes(vehicle.status)) return false
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const searchableText = `${vehicle.vehicleNumber} ${vehicle.make} ${vehicle.model}`.toLowerCase()
        if (!searchableText.includes(searchLower)) return false
      }

      // Make/Model filter
      if (filters.makeModel) {
        const makeModelLower = filters.makeModel.toLowerCase()
        const vehicleMakeModel = `${vehicle.make} ${vehicle.model}`.toLowerCase()
        if (!vehicleMakeModel.includes(makeModelLower)) return false
      }

      return true
    })
  }
}
