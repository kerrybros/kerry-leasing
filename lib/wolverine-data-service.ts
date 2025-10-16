// Real Wolverine Data Service
import { CustomerConfig } from './customer-config'

export interface WolverineUnit {
  unitId: string
  customerGroup: string
  customer: string
  active: string
  status: string
  type: string
  number: string
  fleetNumber: string
  nickname: string
  licensePlate: string
  vin: string
  year: string
  make: string
  model: string
  miles: string
  engineYear: string
  engineMake: string
  engineModel: string
  engineSerial: string
  tireSize: string
  trackPM: string
  primaryLocation: string
  accessMethod: string
}

export interface WolverineRevenue {
  shop: string
  customerGroup: string
  customer: string
  unit: string
  unitNickname: string
  unitType: string
  unitMiles: string
  invoiceDate: string
  order: string
  type: string
  item: string
  itemDisplayTitle: string
  complaintDescription: string
  serviceDescription: string
  globalServiceDescription: string
  component: string
  system: string
  dateActionCompleted: string
  partCategory: string
  partNumber: string
  partDescription: string
  qty: string
  actualHours: string
  leadTech: string
}

export class WolverineDataService {
  private config: CustomerConfig
  private unitsCache: WolverineUnit[] | null = null
  private revenueCache: WolverineRevenue[] | null = null
  private cacheExpiry: number = 5 * 60 * 1000 // 5 minutes
  private lastCacheTime: number = 0
  private loadingPromise: Promise<[WolverineUnit[], WolverineRevenue[]]> | null = null

  constructor(config: CustomerConfig) {
    this.config = config
  }

  private async loadDataWithCache(): Promise<[WolverineUnit[], WolverineRevenue[]]> {
    const now = Date.now()
    
    // Return cached data if it's still valid
    if (this.unitsCache && this.revenueCache && (now - this.lastCacheTime) < this.cacheExpiry) {
      return [this.unitsCache, this.revenueCache]
    }
    
    // If already loading, wait for the existing promise
    if (this.loadingPromise) {
      return this.loadingPromise
    }
    
    // Start loading data
    this.loadingPromise = this.loadData()
    
    try {
      const result = await this.loadingPromise
      this.unitsCache = result[0]
      this.revenueCache = result[1]
      this.lastCacheTime = now
      return result
    } finally {
      this.loadingPromise = null
    }
  }

  private async loadData(): Promise<[WolverineUnit[], WolverineRevenue[]]> {
    return Promise.all([
      this.parseUnitsCSV(),
      this.parseRevenueCSV()
    ])
  }

  async parseUnitsCSV(): Promise<WolverineUnit[]> {
    try {
      const response = await fetch('/data/wolverine-units.csv')
      const csvText = await response.text()
      const lines = csvText.split('\n').filter(line => line.trim())
      
      // Skip header row
      const dataLines = lines.slice(1)
      
      return dataLines.map(line => {
        // Parse CSV with quoted fields
        const fields = this.parseCSVLine(line)
        
        return {
          unitId: fields[3] || '',
          customerGroup: fields[1] || '',
          customer: fields[2] || '',
          active: fields[4] || '',
          status: fields[5] || '',
          type: fields[6] || '',
          number: fields[8] || '', // "Number" column (index 8)
          fleetNumber: fields[9] || '', // "Fleet #" column (index 9)
          nickname: fields[11] || '',
          licensePlate: fields[12] || '',
          vin: fields[13] || '',
          year: fields[14] || '',
          make: fields[15] || '',
          model: fields[16] || '',
          miles: fields[17] || '0',
          engineYear: fields[18] || '',
          engineMake: fields[19] || '',
          engineModel: fields[20] || '',
          engineSerial: fields[21] || '',
          tireSize: fields[22] || '',
          trackPM: fields[23] || '',
          primaryLocation: fields[24] || '',
          accessMethod: fields[26] || ''
        }
      }).filter(unit => 
        unit.customer.includes('WOLVERINE') && 
        unit.active === 'Yes'
        // Don't filter by number here - let getFleetVehicles handle the filtering
      )
    } catch (error) {
      console.error('Error parsing units CSV:', error)
      return []
    }
  }

  async parseRevenueCSV(): Promise<WolverineRevenue[]> {
    try {
      const response = await fetch('/data/wolverine-revenue.csv')
      const csvText = await response.text()
      const lines = csvText.split('\n').filter(line => line.trim())
      
      // Skip header row
      const dataLines = lines.slice(1)
      
      return dataLines.map(line => {
        const fields = this.parseCSVLine(line)
        
        return {
          shop: fields[0] || '',
          customerGroup: fields[1] || '',
          customer: fields[2] || '',
          unit: fields[6] || '',
          unitNickname: fields[7] || '',
          unitType: fields[8] || '',
          unitMiles: fields[10] || '',
          invoiceDate: fields[13] || '',
          order: fields[14] || '', // "Order" column (index 14) - DET-11599, etc.
          type: fields[21] || '',
          item: fields[22] || '',
          itemDisplayTitle: fields[23] || '',
          complaintDescription: fields[25] || '',
          serviceDescription: fields[30] || '',
          globalServiceDescription: fields[31] || '',
          component: fields[32] || '',
          system: fields[33] || '',
          dateActionCompleted: fields[34] || '',
          partCategory: fields[35] || '',
          partNumber: fields[36] || '',
          partDescription: fields[37] || '',
          qty: fields[38] || '',
          actualHours: fields[48] || '',
          leadTech: fields[49] || ''
        }
      }).filter(record => 
        record.customer.includes('WOLVERINE') && 
        record.unit && 
        record.unit.trim() !== '' &&
        record.dateActionCompleted &&
        record.serviceDescription
      )
    } catch (error) {
      console.error('Error parsing revenue CSV:', error)
      return []
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"'
          i += 2
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          i++
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim())
        current = ''
        i++
      } else {
        current += char
        i++
      }
    }
    
    // Add the last field
    result.push(current.trim())
    return result
  }

  async getFleetVehicles(): Promise<any[]> {
    const [units, revenue] = await this.loadDataWithCache()
    
    // Create a map to count distinct orders per unit
    const orderCountMap = new Map<string, Set<string>>()
    
    // Process revenue data to count distinct orders per unit
    revenue.forEach(record => {
      if (record.unit && record.order) {
        // Clean the unit number from revenue data
        let cleanUnitNumber = record.unit.replace(/^="|"$/g, '').trim()
        if (cleanUnitNumber.startsWith('=')) {
          cleanUnitNumber = cleanUnitNumber.substring(1)
        }
        
        if (!orderCountMap.has(cleanUnitNumber)) {
          orderCountMap.set(cleanUnitNumber, new Set())
        }
        orderCountMap.get(cleanUnitNumber)!.add(record.order)
      }
    })
    
    return units.map(unit => {
      // Clean the number field - remove Excel formula artifacts and equals sign
      let cleanNumber = unit.number.replace(/^="|"$/g, '').trim()
      if (cleanNumber.startsWith('=')) {
        cleanNumber = cleanNumber.substring(1) // Remove leading equals sign
      }
      
      // Get distinct order count for this unit
      const distinctOrders = orderCountMap.get(cleanNumber)
      const totalRepairs = distinctOrders ? distinctOrders.size : 0
      
      return {
        id: unit.unitId,
        vehicleNumber: cleanNumber, // Use cleaned "Number" field as the vehicle identifier
        make: unit.make || 'Unknown',
        model: unit.model || 'Unknown',
        year: parseInt(unit.year) || new Date().getFullYear(),
        status: this.mapStatus(unit.status),
        mileage: parseFloat(unit.miles.replace(/,/g, '')) || 0,
        location: unit.primaryLocation || 'Fleet Location',
        lastService: this.getRandomPastDate(30),
        nextService: this.getRandomFutureDate(90),
        vin: unit.vin,
        licensePlate: unit.licensePlate,
        type: unit.type,
        totalRepairs: totalRepairs, // Now calculated from distinct orders
        repairCost: 0 // Set to 0 as requested
      }
    }).filter(vehicle => 
      vehicle.vehicleNumber && 
      vehicle.vehicleNumber.trim() !== '' && 
      vehicle.vehicleNumber !== '='
    ).sort((a, b) => {
      const aNum = parseInt(a.vehicleNumber) || 0
      const bNum = parseInt(b.vehicleNumber) || 0
      return aNum - bNum
    })
  }

  async getMaintenanceRecords(): Promise<any[]> {
    const [units, revenue] = await this.loadDataWithCache()

    // Create a map of unit numbers to unit IDs
    const unitMap = new Map<string, string>()
    units.forEach(unit => {
      let cleanNumber = unit.number.replace(/^="|"$/g, '').trim()
      if (cleanNumber.startsWith('=')) {
        cleanNumber = cleanNumber.substring(1)
      }
      if (cleanNumber && cleanNumber !== '=') {
        unitMap.set(cleanNumber, unit.unitId)
        // Also map the raw unit number for safety
        unitMap.set(unit.number, unit.unitId)
      }
    })

        // Group revenue records by Order and Unit
        const orderGroups = new Map<string, {
          unit: string
          order: string
          completedDate: Date
          serviceDescriptions: string[]
          totalHours: number
        }>()

    // Process revenue data to group by order
    revenue.forEach((record, index) => {
      if (record.serviceDescription && 
          record.dateActionCompleted && 
          record.order &&
          record.unit &&
          this.isMaintenanceWork(record)) {
        
        
            const completedDate = this.parseDate(record.dateActionCompleted)
            if (!completedDate || !this.isAtLeastOneWeekOld(completedDate)) {
              return
            }

        // Clean unit number for consistent grouping
        let cleanUnitNumber = record.unit.replace(/^="|"$/g, '').trim()
        if (cleanUnitNumber.startsWith('=')) {
          cleanUnitNumber = cleanUnitNumber.substring(1)
        }

            // Check if we have this unit in our units map
            // Revenue "Unit" column should match Units "Number" column
            const hasUnit = unitMap.has(record.unit) || unitMap.has(cleanUnitNumber)
            if (!hasUnit) {
              return
            }

        const key = `${cleanUnitNumber}-${record.order}`
        
            if (!orderGroups.has(key)) {
              orderGroups.set(key, {
                unit: cleanUnitNumber,
                order: record.order,
                completedDate,
                serviceDescriptions: [],
                totalHours: 0
              })
            }

        const group = orderGroups.get(key)!
        const cleanDescription = this.cleanServiceDescription(record.serviceDescription)
        
        // Add unique service descriptions
        if (!group.serviceDescriptions.includes(cleanDescription)) {
          group.serviceDescriptions.push(cleanDescription)
        }
        
        // Add labor hours
        group.totalHours += parseFloat(record.actualHours) || 0
      }
    })


        // Convert grouped orders to maintenance records
        const maintenanceRecords = Array.from(orderGroups.values()).map((group, index) => {
          return {
            id: `W${String(index + 1).padStart(4, '0')}`,
            vehicleId: group.unit,
            order: group.order,
            type: 'repair' as const, // All orders are repairs
            description: `Service Work Completed`,
            serviceDescriptions: group.serviceDescriptions,
            date: group.completedDate,
            status: 'completed' as const,
            priority: this.determinePriorityFromDescriptions(group.serviceDescriptions)
          }
        }).sort((a, b) => b.date.getTime() - a.date.getTime())
    
    return maintenanceRecords
  }

  private determineMaintenanceTypeFromDescriptions(descriptions: string[]): 'preventive' | 'repair' | 'inspection' {
    // Check all descriptions to determine the primary type
    const allText = descriptions.join(' ').toLowerCase()
    
    if (allText.includes('preventive') || allText.includes('pm service') || allText.includes('scheduled maintenance')) {
      return 'preventive'
    }
    if (allText.includes('inspection') || allText.includes('dot inspection') || allText.includes('safety check')) {
      return 'inspection'
    }
    return 'repair' // Default to repair
  }

  private determinePriorityFromDescriptions(descriptions: string[]): 'low' | 'medium' | 'high' {
    const allText = descriptions.join(' ').toLowerCase()
    
    if (allText.includes('urgent') || allText.includes('critical') || allText.includes('breakdown')) {
      return 'high'
    }
    if (allText.includes('check engine') || allText.includes('warning light') || descriptions.length > 3) {
      return 'medium'
    }
    return 'low'
  }

  private mapStatus(status: string): string {
    if (status?.toLowerCase().includes('confirmed')) return 'active'
    if (status?.toLowerCase().includes('new')) return 'active'
    return 'inactive'
  }

  private isMaintenanceWork(record: WolverineRevenue): boolean {
    const description = record.serviceDescription?.toLowerCase() || ''
    const system = record.system?.toLowerCase() || ''
    
    // Include maintenance-related work
    return description.includes('maintenance') ||
           description.includes('repair') ||
           description.includes('service') ||
           description.includes('inspection') ||
           description.includes('r&r') ||
           description.includes('replace') ||
           description.includes('check') ||
           system.includes('maintenance')
  }

  private determineMaintenanceType(record: WolverineRevenue): 'preventive' | 'repair' | 'inspection' {
    const description = record.serviceDescription?.toLowerCase() || ''
    const system = record.system?.toLowerCase() || ''
    
    if (description.includes('inspection') || description.includes('check')) {
      return 'inspection'
    }
    if (description.includes('preventive') || description.includes('maintenance') || 
        description.includes('service') || system.includes('maintenance')) {
      return 'preventive'
    }
    return 'repair'
  }

  private determinePriority(record: WolverineRevenue): 'low' | 'medium' | 'high' {
    const description = record.serviceDescription?.toLowerCase() || ''
    
    if (description.includes('emergency') || description.includes('urgent') || 
        description.includes('critical') || description.includes('breakdown')) {
      return 'high'
    }
    if (description.includes('preventive') || description.includes('scheduled')) {
      return 'low'
    }
    return 'medium'
  }

  private cleanServiceDescription(description: string): string {
    // Remove newlines and extra whitespace
    return description
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200) // Limit length
  }

  private parseDate(dateString: string): Date {
    try {
      // Handle various date formats from the CSV
      if (dateString.includes('PM') || dateString.includes('AM')) {
        // Extract just the date part if it includes time
        const datePart = dateString.split(' ').slice(1).join(' ')
        return new Date(datePart)
      }
      return new Date(dateString)
    } catch {
      return new Date()
    }
  }

  private isAtLeastOneWeekOld(date: Date): boolean {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    return date <= oneWeekAgo
  }

  private getRandomPastDate(daysBack: number): Date {
    const date = new Date()
    date.setDate(date.getDate() - Math.floor(Math.random() * daysBack))
    return date
  }

  private getRandomFutureDate(daysAhead: number): Date {
    const date = new Date()
    date.setDate(date.getDate() + Math.floor(Math.random() * daysAhead))
    return date
  }
}
