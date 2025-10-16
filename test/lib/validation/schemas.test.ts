/**
 * Tests for validation schemas
 */

import { describe, it, expect } from 'vitest'
import {
  FleetVehicleSchema,
  MaintenanceRecordSchema,
  CustomerConfigSchema,
  validateData,
  safeParseData,
} from '@/lib/validation/schemas'

describe('FleetVehicleSchema', () => {
  it('validates a complete fleet vehicle', () => {
    const validVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: 50000,
      status: 'active',
      lastService: new Date('2024-01-15'),
      nextService: new Date('2024-04-15'),
    }

    const result = FleetVehicleSchema.safeParse(validVehicle)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validVehicle)
    }
  })

  it('validates with minimal required fields', () => {
    const minimalVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: 50000,
    }

    const result = FleetVehicleSchema.safeParse(minimalVehicle)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('active') // default value
    }
  })

  it('rejects invalid year', () => {
    const invalidVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 1800, // too old
      mileage: 50000,
    }

    const result = FleetVehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('1900')
    }
  })

  it('rejects negative mileage', () => {
    const invalidVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: -1000, // negative
    }

    const result = FleetVehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('cannot be negative')
    }
  })

  it('rejects unknown properties', () => {
    const vehicleWithExtra = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: 50000,
      unknownField: 'should be rejected',
    }

    const result = FleetVehicleSchema.safeParse(vehicleWithExtra)
    expect(result.success).toBe(false)
  })
})

describe('MaintenanceRecordSchema', () => {
  it('validates a complete maintenance record', () => {
    const validRecord = {
      id: 'maintenance-1',
      vehicleId: 'vehicle-1',
      vehicleNumber: '001',
      order: 'ORD-001',
      type: 'repair',
      description: 'Oil change',
      serviceDescriptions: ['Oil change', 'Filter replacement'],
      date: new Date('2024-01-15'),
      status: 'completed',
      priority: 'medium',
    }

    const result = MaintenanceRecordSchema.safeParse(validRecord)
    expect(result.success).toBe(true)
  })

  it('applies default values', () => {
    const minimalRecord = {
      id: 'maintenance-1',
      vehicleId: 'vehicle-1',
      vehicleNumber: '001',
      order: 'ORD-001',
      description: 'Oil change',
      serviceDescriptions: ['Oil change'],
      date: new Date('2024-01-15'),
    }

    const result = MaintenanceRecordSchema.safeParse(minimalRecord)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('repair')
      expect(result.data.status).toBe('completed')
      expect(result.data.priority).toBe('medium')
    }
  })

  it('rejects empty service descriptions', () => {
    const invalidRecord = {
      id: 'maintenance-1',
      vehicleId: 'vehicle-1',
      vehicleNumber: '001',
      order: 'ORD-001',
      description: 'Oil change',
      serviceDescriptions: [], // empty array
      date: new Date('2024-01-15'),
    }

    const result = MaintenanceRecordSchema.safeParse(invalidRecord)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('At least one')
    }
  })
})

describe('CustomerConfigSchema', () => {
  it('validates a complete customer config', () => {
    const validConfig = {
      id: 'customer-1',
      name: 'Test Customer',
      slug: 'test-customer',
      branding: {
        companyName: 'Test Company',
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#2563eb',
        secondaryColor: '#64748b',
      },
      features: {
        maintenanceTracking: true,
        fuelAnalytics: true,
        idleAnalysis: false,
        reportGeneration: true,
        fleetOverview: true,
        maintenance: true,
        reports: true,
        serviceRequests: false,
      },
      serviceRequest: {
        type: 'external_link',
        value: 'https://example.com/service',
        enabled: true,
      },
      dataMapping: {
        vehicleNumberField: 'vehicleNumber',
        unitField: 'unit',
        makeField: 'make',
        modelField: 'model',
        yearField: 'year',
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    const result = CustomerConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  it('applies default values for features and dataMapping', () => {
    const minimalConfig = {
      id: 'customer-1',
      name: 'Test Customer',
      slug: 'test-customer',
      branding: {
        companyName: 'Test Company',
        primaryColor: '#2563eb',
        secondaryColor: '#64748b',
      },
      serviceRequest: {
        type: 'external_link',
        value: 'https://example.com/service',
        enabled: true,
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    const result = CustomerConfigSchema.safeParse(minimalConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.features.maintenanceTracking).toBe(true)
      expect(result.data.dataMapping.vehicleNumberField).toBe('vehicleNumber')
    }
  })

  it('rejects invalid hex colors', () => {
    const invalidConfig = {
      id: 'customer-1',
      name: 'Test Customer',
      slug: 'test-customer',
      branding: {
        companyName: 'Test Company',
        primaryColor: 'blue', // invalid hex
        secondaryColor: '#64748b',
      },
      serviceRequest: {
        type: 'external_link',
        value: 'https://example.com/service',
        enabled: true,
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    const result = CustomerConfigSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('hex color')
    }
  })

  it('rejects invalid slug format', () => {
    const invalidConfig = {
      id: 'customer-1',
      name: 'Test Customer',
      slug: 'Test Customer!', // invalid characters
      branding: {
        companyName: 'Test Company',
        primaryColor: '#2563eb',
        secondaryColor: '#64748b',
      },
      serviceRequest: {
        type: 'external_link',
        value: 'https://example.com/service',
        enabled: true,
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    const result = CustomerConfigSchema.safeParse(invalidConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('lowercase letters')
    }
  })
})

describe('validateData utility', () => {
  it('returns success for valid data', () => {
    const validVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: 50000,
    }

    const result = validateData(FleetVehicleSchema, validVehicle, 'test context')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(expect.objectContaining(validVehicle))
    }
  })

  it('returns error for invalid data', () => {
    const invalidVehicle = {
      id: 'vehicle-1',
      // missing required fields
    }

    const result = validateData(FleetVehicleSchema, invalidVehicle, 'test context')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('test context')
      expect(result.details).toBeDefined()
    }
  })
})

describe('safeParseData utility', () => {
  it('returns parsed data for valid input', () => {
    const validVehicle = {
      id: 'vehicle-1',
      vehicleNumber: '001',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      mileage: 50000,
    }

    const result = safeParseData(FleetVehicleSchema, validVehicle, {} as any)
    expect(result).toEqual(expect.objectContaining(validVehicle))
  })

  it('returns fallback for invalid input', () => {
    const invalidVehicle = { id: 'invalid' }
    const fallback = { id: 'fallback', vehicleNumber: '000', make: 'Unknown', model: 'Unknown', year: 2024, mileage: 0 }

    const result = safeParseData(FleetVehicleSchema, invalidVehicle, fallback)
    expect(result).toEqual(fallback)
  })
})
