// Mock Idle Event Data for Development and Demo

import { IdleEvent, Geofence, Driver, IdleAggregation } from './idle-data-types'

// Mock Geofences (Detroit area locations)
export const mockGeofences: Geofence[] = [
  {
    id: 'gf-1',
    name: 'Wolverine Packing Facility',
    type: 'customer',
    coordinates: [
      [-83.0458, 42.3314], [-83.0448, 42.3314], [-83.0448, 42.3324], [-83.0458, 42.3324], [-83.0458, 42.3314]
    ],
    center: [-83.0453, 42.3319],
    allowedIdleTime: 15,
    description: 'Main customer loading dock',
    color: '#10B981'
  },
  {
    id: 'gf-2',
    name: 'Kerry Brothers Depot',
    type: 'depot',
    coordinates: [
      [-83.0508, 42.3280], [-83.0498, 42.3280], [-83.0498, 42.3290], [-83.0508, 42.3290], [-83.0508, 42.3280]
    ],
    center: [-83.0503, 42.3285],
    allowedIdleTime: 30,
    description: 'Main depot and maintenance facility',
    color: '#3B82F6'
  },
  {
    id: 'gf-3',
    name: 'I-75 Rest Area',
    type: 'service_area',
    coordinates: [
      [-83.1200, 42.4100], [-83.1190, 42.4100], [-83.1190, 42.4110], [-83.1200, 42.4110], [-83.1200, 42.4100]
    ],
    center: [-83.1195, 42.4105],
    allowedIdleTime: 10,
    description: 'Highway rest area',
    color: '#F59E0B'
  },
  {
    id: 'gf-4',
    name: 'Downtown No-Idle Zone',
    type: 'no_idle_zone',
    coordinates: [
      [-83.0500, 42.3300], [-83.0400, 42.3300], [-83.0400, 42.3400], [-83.0500, 42.3400], [-83.0500, 42.3300]
    ],
    center: [-83.0450, 42.3350],
    allowedIdleTime: 0,
    description: 'City ordinance no-idle zone',
    color: '#EF4444'
  },
  {
    id: 'gf-5',
    name: 'Ford Dearborn Plant',
    type: 'customer',
    coordinates: [
      [-83.1800, 42.3000], [-83.1790, 42.3000], [-83.1790, 42.3010], [-83.1800, 42.3010], [-83.1800, 42.3000]
    ],
    center: [-83.1795, 42.3005],
    allowedIdleTime: 20,
    description: 'Ford manufacturing facility',
    color: '#10B981'
  }
]

// Mock Drivers
export const mockDrivers: Driver[] = [
  {
    id: 'drv-1',
    name: 'Mike Johnson',
    employeeId: 'EMP001',
    licenseNumber: 'CDL123456',
    hireDate: new Date('2020-03-15'),
    totalIdleTime: 180,
    idleScore: 85
  },
  {
    id: 'drv-2',
    name: 'Sarah Williams',
    employeeId: 'EMP002',
    licenseNumber: 'CDL234567',
    hireDate: new Date('2019-07-22'),
    totalIdleTime: 95,
    idleScore: 92
  },
  {
    id: 'drv-3',
    name: 'Robert Davis',
    employeeId: 'EMP003',
    licenseNumber: 'CDL345678',
    hireDate: new Date('2021-01-10'),
    totalIdleTime: 245,
    idleScore: 78
  },
  {
    id: 'drv-4',
    name: 'Lisa Chen',
    employeeId: 'EMP004',
    licenseNumber: 'CDL456789',
    hireDate: new Date('2018-11-05'),
    totalIdleTime: 120,
    idleScore: 88
  },
  {
    id: 'drv-5',
    name: 'David Miller',
    employeeId: 'EMP005',
    licenseNumber: 'CDL567890',
    hireDate: new Date('2022-02-14'),
    totalIdleTime: 310,
    idleScore: 72
  }
]

// Generate mock idle events
export const generateMockIdleEvents = (vehicleNumbers: string[] = ['222', '223', '224', '225', '226']): IdleEvent[] => {
  const events: IdleEvent[] = []
  const now = new Date()
  
  // Generate events for the last 30 days
  for (let day = 0; day < 30; day++) {
    const date = new Date(now.getTime() - (day * 24 * 60 * 60 * 1000))
    
    // Generate 2-8 events per day across all vehicles
    const eventsPerDay = Math.floor(Math.random() * 7) + 2
    
    for (let i = 0; i < eventsPerDay; i++) {
      const vehicleNumber = vehicleNumbers[Math.floor(Math.random() * vehicleNumbers.length)]
      const driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)]
      const geofence = mockGeofences[Math.floor(Math.random() * mockGeofences.length)]
      
      // Random time during the day
      const hour = Math.floor(Math.random() * 24)
      const minute = Math.floor(Math.random() * 60)
      const startTime = new Date(date)
      startTime.setHours(hour, minute, 0, 0)
      
      // Duration based on location type and some randomness
      let baseDuration = 5
      if (geofence.type === 'customer') baseDuration = 15
      if (geofence.type === 'depot') baseDuration = 25
      if (geofence.type === 'service_area') baseDuration = 8
      if (geofence.type === 'no_idle_zone') baseDuration = 3
      
      const duration = Math.max(1, baseDuration + Math.floor(Math.random() * 20) - 10)
      const endTime = new Date(startTime.getTime() + (duration * 60 * 1000))
      
      // Add some random offset to geofence center for realistic positioning
      const latOffset = (Math.random() - 0.5) * 0.002 // ~200m
      const lngOffset = (Math.random() - 0.5) * 0.002
      const coordinates = {
        latitude: geofence.center[1] + latOffset,
        longitude: geofence.center[0] + lngOffset
      }
      
      // Calculate fuel consumption (roughly 1 gallon per hour idling)
      const fuelConsumed = (duration / 60) * 1.0
      const cost = fuelConsumed * 3.50 // $3.50/gallon
      
      // Determine severity
      let severity: 'low' | 'medium' | 'high' = 'low'
      if (duration > 15) severity = 'medium'
      if (duration > 30) severity = 'high'
      
      // Determine category
      let category: 'authorized' | 'unauthorized' | 'unknown' = 'authorized'
      if (geofence.type === 'no_idle_zone') category = 'unauthorized'
      if (duration > geofence.allowedIdleTime) category = 'unauthorized'
      if (Math.random() < 0.1) category = 'unknown' // 10% unknown
      
      // Generate address
      const addresses = [
        `${Math.floor(Math.random() * 9999)} Main St, Detroit, MI`,
        `${Math.floor(Math.random() * 9999)} Michigan Ave, Detroit, MI`,
        `${Math.floor(Math.random() * 9999)} Woodward Ave, Detroit, MI`,
        `${Math.floor(Math.random() * 9999)} Jefferson Ave, Detroit, MI`,
        `I-75 Mile ${Math.floor(Math.random() * 100)}, Detroit, MI`
      ]
      
      events.push({
        id: `idle-${events.length + 1}`,
        vehicleId: `vehicle-${vehicleNumber}`,
        vehicleNumber,
        driverId: driver.id,
        driverName: driver.name,
        startTime,
        endTime,
        duration,
        coordinates,
        address: addresses[Math.floor(Math.random() * addresses.length)],
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        reason: Math.random() < 0.3 ? ['Loading/Unloading', 'Traffic Delay', 'Driver Break', 'Maintenance Check'][Math.floor(Math.random() * 4)] : undefined,
        fuelConsumed: Math.round(fuelConsumed * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        severity,
        category
      })
    }
  }
  
  return events.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
}

// Generate aggregated idle data by geofence
export const generateIdleAggregations = (events: IdleEvent[]): IdleAggregation[] => {
  const aggregationMap = new Map<string, IdleAggregation>()
  
  events.forEach(event => {
    if (!event.geofenceId) return
    
    if (!aggregationMap.has(event.geofenceId)) {
      const geofence = mockGeofences.find(g => g.id === event.geofenceId)!
      aggregationMap.set(event.geofenceId, {
        geofenceId: event.geofenceId,
        geofenceName: event.geofenceName || geofence.name,
        coordinates: geofence.center,
        eventCount: 0,
        totalDuration: 0,
        totalFuelConsumed: 0,
        totalCost: 0,
        severity: 'low',
        events: [],
        vehicles: [],
        drivers: []
      })
    }
    
    const aggregation = aggregationMap.get(event.geofenceId)!
    aggregation.eventCount++
    aggregation.totalDuration += event.duration
    aggregation.totalFuelConsumed += event.fuelConsumed
    aggregation.totalCost += event.cost
    aggregation.events.push(event)
    
    if (!aggregation.vehicles.includes(event.vehicleNumber)) {
      aggregation.vehicles.push(event.vehicleNumber)
    }
    if (!aggregation.drivers.includes(event.driverName)) {
      aggregation.drivers.push(event.driverName)
    }
    
    // Update severity based on total duration
    if (aggregation.totalDuration > 120) aggregation.severity = 'high'
    else if (aggregation.totalDuration > 60) aggregation.severity = 'medium'
  })
  
  return Array.from(aggregationMap.values()).sort((a, b) => b.totalDuration - a.totalDuration)
}

// Export default mock data
export const mockIdleEvents = generateMockIdleEvents()
export const mockIdleAggregations = generateIdleAggregations(mockIdleEvents)
