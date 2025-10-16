// Maintenance feature exports
export { useMaintenanceRecords, useMaintenanceRecord } from '@/lib/hooks/use-api'
export { MaintenanceRecordSchema, type MaintenanceRecord } from '@/lib/schemas'
export { MaintenanceErrorBoundary } from '@/lib/components/error-boundary'

// Import types for local use
import type { MaintenanceRecord } from '@/lib/schemas'

// Maintenance-specific types
export interface MaintenanceHistoryProps {
  vehicleId: string
  customerId: string
  limit?: number
}

export interface MaintenanceCardProps {
  record: MaintenanceRecord
  onClick?: () => void
  showVehicle?: boolean
}

export interface MaintenanceSummaryProps {
  records: MaintenanceRecord[]
  dateRange?: {
    start: Date
    end: Date
  }
}

// Maintenance utilities
export const maintenanceUtils = {
  getTypeColor: (type: MaintenanceRecord['type']) => {
    const colors = {
      preventive: 'bg-blue-100 text-blue-800',
      repair: 'bg-red-100 text-red-800',
      inspection: 'bg-green-100 text-green-800',
      emergency: 'bg-orange-100 text-orange-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  },

  getStatusColor: (status: MaintenanceRecord['status']) => {
    const colors = {
      scheduled: 'bg-purple-100 text-purple-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  },

  getPriorityColor: (priority: MaintenanceRecord['priority']) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  },

  calculateStats: (records: MaintenanceRecord[]) => {
    const completed = records.filter(r => r.status === 'completed')
    const inProgress = records.filter(r => r.status === 'in_progress')
    const scheduled = records.filter(r => r.status === 'scheduled')
    
    const totalCost = completed.reduce((sum, r) => sum + (r.cost || 0), 0)
    const totalHours = completed.reduce((sum, r) => sum + (r.laborHours || 0), 0)
    
    return {
      total: records.length,
      completed: completed.length,
      inProgress: inProgress.length,
      scheduled: scheduled.length,
      totalCost,
      totalHours,
      avgCostPerRecord: completed.length > 0 ? totalCost / completed.length : 0,
    }
  },

  groupByVehicle: (records: MaintenanceRecord[]) => {
    return records.reduce((groups, record) => {
      if (!groups[record.vehicleId]) {
        groups[record.vehicleId] = []
      }
      groups[record.vehicleId].push(record)
      return groups
    }, {} as Record<string, MaintenanceRecord[]>)
  },

  groupByOrder: (records: MaintenanceRecord[]) => {
    return records.reduce((groups, record) => {
      if (!groups[record.order]) {
        groups[record.order] = []
      }
      groups[record.order].push(record)
      return groups
    }, {} as Record<string, MaintenanceRecord[]>)
  },

  filterByDateRange: (records: MaintenanceRecord[], start: Date, end: Date) => {
    return records.filter(record => {
      const recordDate = new Date(record.date)
      return recordDate >= start && recordDate <= end
    })
  },

  getUpcomingMaintenance: (records: MaintenanceRecord[], days: number = 30) => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000))
    
    return records.filter(record => {
      if (record.status !== 'scheduled') return false
      const recordDate = new Date(record.date)
      return recordDate >= now && recordDate <= futureDate
    })
  },

  getOverdueMaintenance: (records: MaintenanceRecord[]) => {
    const now = new Date()
    
    return records.filter(record => {
      if (record.status !== 'scheduled') return false
      const recordDate = new Date(record.date)
      return recordDate < now
    })
  }
}
