// Centralized feature exports for clean imports across the app

// Fleet feature
export * from './fleet'

// Maintenance feature  
export * from './maintenance'

// Customer/Multi-tenant feature
export * from './customer'

// Shared utilities from lib
export { 
  cn, 
  dateUtils, 
  numberUtils, 
  stringUtils, 
  arrayUtils, 
  colorUtils, 
  validationUtils, 
  storageUtils,
  debounce,
  throttle 
} from '@/lib/utils'

export { 
  LoadingState, 
  LoadingSpinner, 
  LoadingCard, 
  LoadingTable, 
  LoadingGrid 
} from '@/lib/components/loading-state'

export { 
  ErrorBoundary, 
  FleetErrorBoundary, 
  MaintenanceErrorBoundary 
} from '@/lib/components/error-boundary'

export { useAppStore } from '@/lib/stores/app-store'
export { apiClient, api } from '@/lib/services/api'

// Re-export important schemas for validation
export {
  FleetVehicleSchema,
  MaintenanceRecordSchema,
  CustomerConfigSchema,
  validateFleetVehicle,
  validateMaintenanceRecord,
  validateCustomerConfig,
  safeParseFleetVehicle,
  safeParseMaintenanceRecord,
  safeParseCustomerConfig,
} from '@/lib/schemas'
