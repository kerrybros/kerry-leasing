/**
 * Comprehensive Zod schemas for runtime validation
 * Ensures data integrity and prevents runtime errors from invalid API responses
 */

import { z } from 'zod'

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const IdSchema = z.string().min(1, 'ID cannot be empty')
export const EmailSchema = z.string().email('Invalid email format')
export const PhoneSchema = z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format')
export const UrlSchema = z.string().url('Invalid URL format')

// Date schemas with flexible parsing
export const DateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  'Invalid date format'
)

export const DateSchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') return new Date(val)
    if (val instanceof Date) return val
    return val
  },
  z.date({ invalid_type_error: 'Invalid date' })
)

// ============================================================================
// FLEET & VEHICLE SCHEMAS
// ============================================================================

export const VehicleStatusSchema = z.enum(['active', 'maintenance', 'in_service', 'out_of_service'], {
  errorMap: () => ({ message: 'Invalid vehicle status' })
})

export const FleetVehicleSchema = z.object({
  id: IdSchema,
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number()
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(new Date().getFullYear() + 2, 'Year cannot be more than 2 years in the future'),
  mileage: z.number()
    .min(0, 'Mileage cannot be negative'),
  status: VehicleStatusSchema.default('active'),
  lastService: DateSchema.nullable().optional(),
  nextService: DateSchema.nullable().optional(),
  currentMileage: z.number()
    .min(0, 'Current mileage cannot be negative')
    .optional(),
  // Additional fields that might come from API
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  fuelType: z.enum(['gasoline', 'diesel', 'electric', 'hybrid']).optional(),
  engineSize: z.string().optional(),
  color: z.string().optional(),
  // Fields from Wolverine data service
  location: z.string().optional(),
  totalRepairs: z.number().min(0).optional(),
  repairCost: z.number().min(0).optional(),
  type: z.string().optional(),
  // Multi-tenant fields - make optional with defaults
  customerId: IdSchema.optional(),
  createdAt: DateSchema.optional(),
  updatedAt: DateSchema.optional()
}).passthrough() // Allow unknown properties instead of strict rejection

export type FleetVehicle = z.infer<typeof FleetVehicleSchema>

// ============================================================================
// MAINTENANCE SCHEMAS
// ============================================================================

export const MaintenanceTypeSchema = z.enum(['repair'], {
  errorMap: () => ({ message: 'Invalid maintenance type' })
})

export const MaintenanceStatusSchema = z.enum(['completed', 'in_progress', 'scheduled'], {
  errorMap: () => ({ message: 'Invalid maintenance status' })
})

export const MaintenancePrioritySchema = z.enum(['low', 'medium', 'high'], {
  errorMap: () => ({ message: 'Invalid maintenance priority' })
})

export const MaintenanceRecordSchema = z.object({
  id: IdSchema,
  vehicleId: IdSchema,
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  order: z.string().min(1, 'Order number is required'),
  type: MaintenanceTypeSchema.default('repair'),
  description: z.string().min(1, 'Description is required'),
  serviceDescriptions: z.array(z.string().min(1, 'Service description cannot be empty'))
    .min(1, 'At least one service description is required'),
  date: DateSchema,
  status: MaintenanceStatusSchema.default('completed'),
  priority: MaintenancePrioritySchema.default('medium'),
  // Fields removed per user requirements but kept for API compatibility
  laborHours: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  technician: z.string().optional(),
  completedDate: DateSchema.optional(),
  // Multi-tenant fields - make optional with defaults
  customerId: IdSchema.optional(),
  createdAt: DateSchema.optional(),
  updatedAt: DateSchema.optional()
}).passthrough() // Allow unknown properties instead of strict rejection

export type MaintenanceRecord = z.infer<typeof MaintenanceRecordSchema>

// ============================================================================
// PERFORMANCE & ANALYTICS SCHEMAS
// ============================================================================

export const PerformanceDataSchema = z.object({
  date: DateStringSchema,
  miles: z.number().min(0, 'Miles cannot be negative'),
  fuelUsed: z.number().min(0, 'Fuel used cannot be negative'),
  mpg: z.number().min(0, 'MPG cannot be negative'),
  idleTime: z.number().min(0, 'Idle time cannot be negative'), // in minutes
  idlePercent: z.number().min(0, 'Idle percent cannot be negative').max(100, 'Idle percent cannot exceed 100')
}).strict()

export type PerformanceData = z.infer<typeof PerformanceDataSchema>

// ============================================================================
// USER & AUTHENTICATION SCHEMAS
// ============================================================================

export const UserRoleSchema = z.enum(['admin', 'fleet_manager', 'driver', 'viewer'], {
  errorMap: () => ({ message: 'Invalid user role' })
})

export const UserSchema = z.object({
  id: IdSchema,
  email: EmailSchema,
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  role: UserRoleSchema,
  customerId: IdSchema.optional(),
  isActive: z.boolean().default(true),
  lastLoginAt: DateSchema.nullable().optional(),
  createdAt: DateSchema,
  updatedAt: DateSchema
}).strict()

export type User = z.infer<typeof UserSchema>

// ============================================================================
// CUSTOMER & CONFIGURATION SCHEMAS
// ============================================================================

export const CustomerBrandingSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(100, 'Company name too long'),
  logoUrl: UrlSchema.optional(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format')
    .default('#2563eb'),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format')
    .default('#64748b')
}).strict()

export const CustomerFeaturesSchema = z.object({
  maintenanceTracking: z.boolean().default(true),
  fuelAnalytics: z.boolean().default(true),
  idleAnalysis: z.boolean().default(true),
  reportGeneration: z.boolean().default(true),
  fleetOverview: z.boolean().default(true),
  maintenance: z.boolean().default(true),
  reports: z.boolean().default(true),
  serviceRequests: z.boolean().default(true)
}).strict()

export const ServiceRequestTypeSchema = z.enum(['external_link', 'email', 'form', 'api'], {
  errorMap: () => ({ message: 'Invalid service request type' })
})

export const ServiceRequestConfigSchema = z.object({
  type: ServiceRequestTypeSchema.default('external_link'),
  value: z.string().min(1, 'Service request value is required'),
  enabled: z.boolean().default(true)
}).strict()

export const CustomerDataMappingSchema = z.object({
  vehicleNumberField: z.string().default('vehicleNumber'),
  unitField: z.string().default('unit'),
  makeField: z.string().default('make'),
  modelField: z.string().default('model'),
  yearField: z.string().default('year')
}).strict()

export const CustomerConfigSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'Customer name is required').max(100, 'Customer name too long'),
  slug: z.string().min(1, 'Customer slug is required').max(50, 'Customer slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  branding: CustomerBrandingSchema,
  features: CustomerFeaturesSchema,
  serviceRequest: ServiceRequestConfigSchema,
  dataMapping: CustomerDataMappingSchema,
  createdAt: DateSchema,
  updatedAt: DateSchema
}).strict()

export type CustomerConfig = z.infer<typeof CustomerConfigSchema>

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
    timestamp: DateStringSchema.optional()
  })

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional()
  }),
  timestamp: DateStringSchema.optional()
})

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([
    ApiSuccessResponseSchema(dataSchema),
    ApiErrorResponseSchema
  ])

// ============================================================================
// FORM VALIDATION SCHEMAS
// ============================================================================

export const ServiceRequestFormSchema = z.object({
  vehicleId: IdSchema,
  description: z.string().min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description cannot exceed 1000 characters'),
  priority: MaintenancePrioritySchema.default('medium'),
  preferredDate: DateSchema.optional(),
  contactEmail: EmailSchema.optional(),
  contactPhone: PhoneSchema.optional()
}).strict()

export const UserProfileFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name too long'),
  email: EmailSchema,
  phone: PhoneSchema.optional()
}).strict()

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates data against a schema and returns typed result
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): { success: true; data: T } | { success: false; error: string; details: z.ZodError } {
  try {
    // Handle undefined/null data gracefully
    if (data === undefined || data === null) {
      throw new z.ZodError([{
        code: 'invalid_type',
        expected: 'object',
        received: data === null ? 'null' : 'undefined',
        path: [],
        message: 'Data is required but was not provided'
      }])
    }

    const validData = schema.parse(data)
    return { success: true, data: validData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const contextMsg = context ? ` in ${context}` : ''
      const errorMessages = error.errors && Array.isArray(error.errors) 
        ? error.errors.map(e => e.message).join(', ')
        : 'Unknown validation error'
      return {
        success: false,
        error: `Validation failed${contextMsg}: ${errorMessages}`,
        details: error
      }
    }
    return {
      success: false,
      error: `Unexpected validation error${context ? ` in ${context}` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error as z.ZodError
    }
  }
}

/**
 * Safely parses data with fallback
 */
export function safeParseData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T
): T {
  const result = schema.safeParse(data)
  return result.success ? result.data : fallback
}

/**
 * Validates API response and extracts data
 */
export function validateApiResponse<T>(
  dataSchema: z.ZodSchema<T>,
  response: unknown
): T {
  const responseSchema = ApiResponseSchema(dataSchema)
  const validResponse = responseSchema.parse(response)
  
  if (validResponse.success) {
    return validResponse.data
  } else {
    throw new Error(validResponse.error.message)
  }
}
