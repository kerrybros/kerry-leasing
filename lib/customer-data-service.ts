import { CustomerConfig } from './customer-config'
import { WolverineDataService } from './wolverine-data-service'
import { ValidationService } from './validation/validation-service'
import { FleetVehicleSchema, MaintenanceRecordSchema, type FleetVehicle, type MaintenanceRecord } from './validation/schemas'

// Re-export types from validation schemas
export type { FleetVehicle, MaintenanceRecord }

// CSV Processing Service
export class CustomerDataService {
  private wolverineService?: WolverineDataService

  constructor(private customerConfig: CustomerConfig) {
    // Initialize specialized data service for Wolverine
    if (customerConfig.id === 'wolverine') {
      this.wolverineService = new WolverineDataService(customerConfig)
    }
  }

  // Filter CSV data for specific customer
  async getCustomerFleetData(): Promise<FleetVehicle[]> {
    // Use real Wolverine data with fallback to mock data
    if (this.wolverineService) {
      try {
        // Set a reasonable timeout to prevent hanging
        const timeoutMs = 10000 // 10 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Fleet data fetch timeout - using fallback')), timeoutMs)
        })
        
        const dataPromise = this.wolverineService.getFleetVehicles()
        const vehicles = await Promise.race([dataPromise, timeoutPromise])
        
        if (vehicles && Array.isArray(vehicles) && vehicles.length > 0) {
          const validatedVehicles = await this.validateFleetData(vehicles)
          return validatedVehicles
        }
      } catch (error) {
        console.warn('Real fleet data failed, using mock data fallback')
      }
    }
    
    // Fallback to mock data if real data fails
    return this.getMockFleetData()
    
    // Fallback to CSV parsing for other customers
    try {
      const response = await fetch(this.customerConfig.dataSources.fleetCsvUrl)
      const csvText = await response.text()
      const allData = this.parseCSV(csvText)
      
      // Filter for this customer's data
      const customerData = allData.filter(row => 
        row[this.customerConfig.dataMapping.customerIdentifier] === 
        this.customerConfig.dataMapping.customerValue
      )
      
      // Map to FleetVehicle format
      return customerData.map(row => ({
        id: row[this.customerConfig.dataMapping.vehicleIdColumn || 'id'],
        vehicleNumber: row[this.customerConfig.dataMapping.vehicleIdColumn || 'vehicle_number'],
        make: row['make'] || '',
        model: row['model'] || '',
        year: parseInt(row['year']) || new Date().getFullYear(),
        status: this.mapStatus(row[this.customerConfig.dataMapping.statusColumn || 'status']),
        mileage: parseInt(row['mileage']) || 0,
        lastService: row[this.customerConfig.dataMapping.dateColumns?.lastService || 'last_service'] 
          ? new Date(row[this.customerConfig.dataMapping.dateColumns?.lastService || 'last_service']) 
          : undefined,
        nextService: row[this.customerConfig.dataMapping.dateColumns?.nextService || 'next_service'] 
          ? new Date(row[this.customerConfig.dataMapping.dateColumns?.nextService || 'next_service']) 
          : undefined,
        location: row['location'] || ''
      }))
    } catch (error) {
      console.error('Error loading fleet data:', error)
      return []
    }
  }

  async getCustomerMaintenanceData(): Promise<MaintenanceRecord[]> {
    // Use real Wolverine maintenance data - NO MORE MOCK DATA for repairs/maintenance
    if (this.wolverineService) {
      try {
        // Set a reasonable timeout to prevent hanging
        const timeoutMs = 10000 // 10 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Maintenance data fetch timeout')), timeoutMs)
        })
        
        const dataPromise = this.wolverineService.getMaintenanceRecords()
        const records = await Promise.race([dataPromise, timeoutPromise])
        
        if (records && Array.isArray(records)) {
          const validatedRecords = await this.validateMaintenanceData(records)
          return validatedRecords
        }
      } catch (error) {
        console.error('Failed to load real maintenance data')
        // Return empty array instead of mock data for maintenance
        return []
      }
    }
    
    // Return empty array if no real data available - NO MOCK DATA for maintenance
    return []
    
    // Fallback to CSV parsing for other customers
    try {
      const response = await fetch(this.customerConfig.dataSources.maintenanceCsvUrl)
      const csvText = await response.text()
      const allData = this.parseCSV(csvText)
      
      // Filter for this customer's data
      const customerData = allData.filter(row => 
        row[this.customerConfig.dataMapping.customerIdentifier] === 
        this.customerConfig.dataMapping.customerValue
      )
      
      return customerData.map(row => ({
        id: row['id'] || `${Date.now()}-${Math.random()}`,
        vehicleId: row[this.customerConfig.dataMapping.vehicleIdColumn || 'vehicle_id'],
        type: this.mapMaintenanceType(row['type']),
        description: row['description'] || '',
        date: new Date(row['date'] || new Date()),
        status: this.mapMaintenanceStatus(row['status']),
        priority: this.mapPriority(row['priority'])
      }))
    } catch (error) {
      console.error('Error loading maintenance data:', error)
      return []
    }
  }

  // Helper methods
  private parseCSV(csvText: string): Array<Record<string, string>> {
    const lines = csvText.split('\n')
    const headers = lines[0].split(',').map(h => h.trim())
    
    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })
        return row
      })
  }

  private mapStatus(status: string): 'active' | 'maintenance' | 'inactive' {
    const statusLower = status?.toLowerCase() || ''
    if (statusLower.includes('maintenance') || statusLower.includes('repair')) return 'maintenance'
    if (statusLower.includes('inactive') || statusLower.includes('out')) return 'inactive'
    return 'active'
  }

  private mapMaintenanceType(type: string): 'preventive' | 'repair' | 'inspection' {
    const typeLower = type?.toLowerCase() || ''
    if (typeLower.includes('preventive') || typeLower.includes('scheduled')) return 'preventive'
    if (typeLower.includes('inspection')) return 'inspection'
    return 'repair'
  }

  private mapMaintenanceStatus(status: string): 'scheduled' | 'in_progress' | 'completed' {
    const statusLower = status?.toLowerCase() || ''
    if (statusLower.includes('progress') || statusLower.includes('working')) return 'in_progress'
    if (statusLower.includes('completed') || statusLower.includes('done')) return 'completed'
    return 'scheduled'
  }

  private mapPriority(priority: string): 'low' | 'medium' | 'high' {
    const priorityLower = priority?.toLowerCase() || ''
    if (priorityLower.includes('high') || priorityLower.includes('urgent')) return 'high'
    if (priorityLower.includes('medium')) return 'medium'
    return 'low'
  }

  private mapVehicleStatus(status: string): 'active' | 'maintenance' | 'in_service' | 'out_of_service' {
    const statusLower = status?.toLowerCase() || ''
    if (statusLower.includes('maintenance') || statusLower.includes('repair')) return 'maintenance'
    if (statusLower.includes('service') || statusLower.includes('working')) return 'in_service'
    if (statusLower.includes('out') || statusLower.includes('inactive')) return 'out_of_service'
    return 'active'
  }

  // Validation methods
  private async validateFleetData(vehicles: any[]): Promise<FleetVehicle[]> {
    // Handle undefined or null data gracefully
    if (!vehicles || !Array.isArray(vehicles)) {
      console.warn('Fleet data is not an array or is undefined')
      return []
    }

    const validatedVehicles: FleetVehicle[] = []
    const now = new Date()
    
    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i]
      
      // Skip null/undefined vehicles
      if (!vehicle) {
        continue
      }

      try {
        // Transform the vehicle data to match the expected schema
        const transformedVehicle = {
          ...vehicle,
          // Add required fields that might be missing
          customerId: this.customerConfig.id,
          createdAt: now,
          updatedAt: now,
          // Ensure status is valid
          status: this.mapVehicleStatus(vehicle.status),
          // Ensure dates are properly formatted
          lastService: vehicle.lastService ? new Date(vehicle.lastService) : null,
          nextService: vehicle.nextService ? new Date(vehicle.nextService) : null,
          // Ensure numeric fields are numbers
          year: typeof vehicle.year === 'string' ? parseInt(vehicle.year) || new Date().getFullYear() : vehicle.year,
          mileage: typeof vehicle.mileage === 'string' ? parseFloat(vehicle.mileage) || 0 : vehicle.mileage,
          totalRepairs: typeof vehicle.totalRepairs === 'string' ? parseInt(vehicle.totalRepairs) || 0 : vehicle.totalRepairs,
          repairCost: typeof vehicle.repairCost === 'string' ? parseFloat(vehicle.repairCost) || 0 : vehicle.repairCost
        }

        const result = await ValidationService.validateWithErrorHandling(
          FleetVehicleSchema,
          transformedVehicle,
          {
            operation: 'fleet_data_validation',
            source: 'api',
            reportErrors: false // Don't report individual validation errors
          }
        )
        
        if (result.success) {
          validatedVehicles.push(result.data)
        } else {
          // Continue processing other vehicles instead of failing completely
        }
      } catch (error) {
        // Continue processing other vehicles
      }
    }
    
    return validatedVehicles
  }

  private async validateMaintenanceData(records: any[]): Promise<MaintenanceRecord[]> {
    // Handle undefined or null data gracefully
    if (!records || !Array.isArray(records)) {
      return []
    }

    const validatedRecords: MaintenanceRecord[] = []
    const now = new Date()
    
    for (const record of records) {
      // Skip null/undefined records
      if (!record) {
        continue
      }

      try {
        // Transform the maintenance record to match the expected schema
        const transformedRecord = {
          ...record,
          // Add required fields that might be missing
          customerId: this.customerConfig.id,
          createdAt: now,
          updatedAt: now,
          // Ensure required fields are present
          type: record.type || 'repair',
          status: this.mapMaintenanceStatus(record.status || 'completed'),
          priority: this.mapPriority(record.priority || 'medium'),
          // Ensure dates are properly formatted
          date: record.date ? new Date(record.date) : now,
          completedDate: record.completedDate ? new Date(record.completedDate) : undefined,
          // Ensure numeric fields are numbers
          cost: typeof record.cost === 'string' ? parseFloat(record.cost) || 0 : record.cost,
          laborHours: typeof record.laborHours === 'string' ? parseFloat(record.laborHours) || 0 : record.laborHours,
          // Ensure serviceDescriptions is an array
          serviceDescriptions: Array.isArray(record.serviceDescriptions) 
            ? record.serviceDescriptions.filter(desc => desc && desc.trim())
            : record.serviceDescription 
              ? [record.serviceDescription]
              : record.description 
                ? [record.description]
                : ['Maintenance work performed']
        }

        const result = await ValidationService.validateWithErrorHandling(
          MaintenanceRecordSchema,
          transformedRecord,
          {
            operation: 'maintenance_data_validation',
            source: 'api',
            reportErrors: false // Don't report individual validation errors
          }
        )
        
        if (result.success) {
          validatedRecords.push(result.data)
        } else {
          // Continue processing other records instead of failing completely
        }
      } catch (error) {
        // Continue processing other records
      }
    }
    
    return validatedRecords
  }

  // Mock data methods for reliable fallback
  private getMockFleetData(): FleetVehicle[] {
    const now = new Date()
    return [
      {
        id: '1',
        vehicleNumber: '101',
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2020,
        status: 'active',
        mileage: 125000,
        lastService: new Date('2024-09-15'),
        nextService: new Date('2024-12-15'),
        location: 'Main Depot',
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: '2',
        vehicleNumber: '102',
        make: 'Volvo',
        model: 'VNL',
        year: 2019,
        status: 'maintenance',
        mileage: 89000,
        lastService: new Date('2024-10-01'),
        nextService: new Date('2024-10-15'),
        location: 'Service Center',
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: '3',
        vehicleNumber: '103',
        make: 'Peterbilt',
        model: '579',
        year: 2021,
        status: 'active',
        mileage: 67000,
        lastService: new Date('2024-09-20'),
        nextService: new Date('2024-12-20'),
        location: 'Route 95',
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      }
    ]
  }

  private getMockMaintenanceData(): MaintenanceRecord[] {
    const now = new Date()
    return [
      {
        id: '1',
        vehicleId: '1',
        vehicleNumber: '101',
        order: 'WO-001',
        type: 'repair',
        description: 'Oil change and filter replacement',
        serviceDescriptions: ['Oil change', 'Filter replacement', 'Inspection'],
        date: new Date('2024-10-01'),
        status: 'completed',
        priority: 'medium',
        cost: 150,
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: '2',
        vehicleId: '2',
        vehicleNumber: '102',
        order: 'WO-002',
        type: 'repair',
        description: 'Brake system maintenance',
        serviceDescriptions: ['Brake pad replacement', 'Brake fluid change'],
        date: new Date('2024-10-05'),
        status: 'scheduled',
        priority: 'high',
        cost: 300,
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      },
      {
        id: '3',
        vehicleId: '3',
        vehicleNumber: '103',
        order: 'WO-003',
        type: 'maintenance',
        description: 'Routine maintenance check',
        serviceDescriptions: ['Tire rotation', 'Fluid check', 'Belt inspection'],
        date: new Date('2024-10-10'),
        status: 'in_progress',
        priority: 'low',
        cost: 200,
        customerId: this.customerConfig.id,
        createdAt: now,
        updatedAt: now
      }
    ]
  }
}
