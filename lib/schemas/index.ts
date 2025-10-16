import { z } from 'zod'

// Base schemas
export const IdSchema = z.string().min(1, 'ID is required')
export const EmailSchema = z.string().email('Invalid email format')
export const DateSchema = z.coerce.date()
export const PositiveNumberSchema = z.number().positive('Must be a positive number')

// Vehicle Status enum
export const VehicleStatusSchema = z.enum(['active', 'maintenance', 'in_service', 'out_of_service'])
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>

// Fleet Vehicle schema
export const FleetVehicleSchema = z.object({
  id: IdSchema,
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  status: VehicleStatusSchema,
  mileage: PositiveNumberSchema,
  fuelEfficiency: z.number().positive().optional(),
  lastService: DateSchema.optional(),
  nextService: DateSchema.optional(),
  utilizationRate: z.number().min(0).max(100).optional(),
  // Multi-tenant
  customerId: IdSchema,
  createdAt: DateSchema,
  updatedAt: DateSchema,
})

export type FleetVehicle = z.infer<typeof FleetVehicleSchema>

// Maintenance Record schema
export const MaintenanceTypeSchema = z.enum(['preventive', 'repair', 'inspection', 'emergency'])
export const MaintenanceStatusSchema = z.enum(['scheduled', 'in_progress', 'completed', 'cancelled'])
export const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const MaintenanceRecordSchema = z.object({
  id: IdSchema,
  vehicleId: IdSchema,
  order: z.string().min(1, 'Order number is required'),
  type: MaintenanceTypeSchema,
  description: z.string().min(1, 'Description is required'),
  serviceDescriptions: z.array(z.string()).default([]),
  date: DateSchema,
  completedDate: DateSchema.optional(),
  status: MaintenanceStatusSchema,
  priority: PrioritySchema,
  cost: z.number().min(0).optional(),
  laborHours: z.number().min(0).optional(),
  technician: z.string().optional(),
  notes: z.string().optional(),
  // Multi-tenant
  customerId: IdSchema,
  createdAt: DateSchema,
  updatedAt: DateSchema,
})

export type MaintenanceRecord = z.infer<typeof MaintenanceRecordSchema>

// Customer Configuration schema
export const CustomerBrandingSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be a valid hex color'),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be a valid hex color').optional(),
})

export const ServiceRequestTypeSchema = z.enum(['external_link', 'email', 'form', 'api'])

export const ServiceRequestConfigSchema = z.object({
  type: ServiceRequestTypeSchema,
  url: z.string().url().optional(),
  email: EmailSchema.optional(),
  apiEndpoint: z.string().url().optional(),
})

export const CustomerConfigSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'Customer name is required'),
  slug: z.string().min(1, 'Customer slug is required'),
  branding: CustomerBrandingSchema,
  features: z.object({
    maintenanceTracking: z.boolean().default(true),
    fuelAnalytics: z.boolean().default(true),
    idleAnalysis: z.boolean().default(true),
    reportGeneration: z.boolean().default(true),
  }).default({
    maintenanceTracking: true,
    fuelAnalytics: true,
    idleAnalysis: true,
    reportGeneration: true,
  }),
  serviceRequest: ServiceRequestConfigSchema,
  dataMapping: z.object({
    vehicleNumberField: z.string().default('vehicleNumber'),
    unitField: z.string().default('unit'),
    makeField: z.string().default('make'),
    modelField: z.string().default('model'),
    yearField: z.string().default('year'),
  }).default({
    vehicleNumberField: 'vehicleNumber',
    unitField: 'unit',
    makeField: 'make',
    modelField: 'model',
    yearField: 'year',
  }),
  createdAt: DateSchema,
  updatedAt: DateSchema,
})

export type CustomerConfig = z.infer<typeof CustomerConfigSchema>

// API Response schemas
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  timestamp: DateSchema,
})

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  timestamp: DateSchema,
})

export const ApiResponseSchema = z.union([ApiSuccessResponseSchema, ApiErrorResponseSchema])

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
})

export type Pagination = z.infer<typeof PaginationSchema>

// Filter schemas
export const FleetFiltersSchema = z.object({
  status: z.array(VehicleStatusSchema).optional(),
  search: z.string().optional(),
  makeModel: z.string().optional(),
  dateRange: z.object({
    start: DateSchema,
    end: DateSchema,
  }).optional(),
  sortBy: z.enum(['vehicleNumber', 'make', 'model', 'year', 'mileage', 'status', 'lastService']).default('vehicleNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type FleetFilters = z.infer<typeof FleetFiltersSchema>

// Utility functions for validation
export function validateFleetVehicle(data: unknown): FleetVehicle {
  return FleetVehicleSchema.parse(data)
}

export function validateMaintenanceRecord(data: unknown): MaintenanceRecord {
  return MaintenanceRecordSchema.parse(data)
}

export function validateCustomerConfig(data: unknown): CustomerConfig {
  return CustomerConfigSchema.parse(data)
}

// Safe parsing functions (returns success/error)
export function safeParseFleetVehicle(data: unknown) {
  return FleetVehicleSchema.safeParse(data)
}

export function safeParseMaintenanceRecord(data: unknown) {
  return MaintenanceRecordSchema.safeParse(data)
}

export function safeParseCustomerConfig(data: unknown) {
  return CustomerConfigSchema.safeParse(data)
}
