// Idle Event Data Types and Interfaces

export interface IdleEvent {
  id: string
  vehicleId: string
  vehicleNumber: string
  driverId: string
  driverName: string
  startTime: Date
  endTime: Date
  duration: number // minutes
  coordinates: {
    latitude: number
    longitude: number
  }
  address: string // reverse geocoded address
  geofenceId?: string // if within a geofence
  geofenceName?: string
  reason?: string // driver-provided reason
  fuelConsumed: number // gallons
  cost: number // dollar cost of idle fuel
  severity: 'low' | 'medium' | 'high' // based on duration
  category: 'authorized' | 'unauthorized' | 'unknown'
}

export interface Geofence {
  id: string
  name: string
  type: 'customer' | 'depot' | 'service_area' | 'no_idle_zone' | 'loading_dock'
  coordinates: number[][] // polygon coordinates [lng, lat]
  center: [number, number] // [lng, lat]
  allowedIdleTime: number // minutes
  description?: string
  color: string // hex color for visualization
}

export interface Driver {
  id: string
  name: string
  employeeId: string
  licenseNumber: string
  hireDate: Date
  totalIdleTime: number // minutes this period
  idleScore: number // 0-100 performance score
}

export interface IdleAggregation {
  geofenceId: string
  geofenceName: string
  coordinates: [number, number] // center point [lng, lat]
  eventCount: number
  totalDuration: number // minutes
  totalFuelConsumed: number // gallons
  totalCost: number
  severity: 'low' | 'medium' | 'high'
  events: IdleEvent[]
  vehicles: string[] // unique vehicle numbers
  drivers: string[] // unique driver names
}

export interface IdleFilters {
  dateRange: {
    start: Date
    end: Date
  }
  vehicleIds: string[]
  driverIds: string[]
  geofenceIds: string[]
  minDuration: number // minutes
  maxDuration: number // minutes
  categories: ('authorized' | 'unauthorized' | 'unknown')[]
}

export interface IdleAnalytics {
  totalEvents: number
  totalDuration: number // minutes
  totalFuelWasted: number // gallons
  totalCost: number
  averageEventDuration: number // minutes
  topIdleLocations: IdleAggregation[]
  topIdleVehicles: { vehicleNumber: string; duration: number; eventCount: number }[]
  topIdleDrivers: { driverName: string; duration: number; eventCount: number }[]
  timeOfDayPattern: { hour: number; eventCount: number; totalDuration: number }[]
  dayOfWeekPattern: { day: string; eventCount: number; totalDuration: number }[]
}
