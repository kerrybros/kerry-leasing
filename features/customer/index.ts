// Customer/Multi-tenant feature exports
export { useCustomerConfig, useCurrentCustomer } from '@/lib/hooks/use-api'
export { CustomerConfigSchema, type CustomerConfig } from '@/lib/schemas'

// Import types for local use
import type { CustomerConfig } from '@/lib/schemas'

// Customer-specific types
export interface CustomerBranding {
  companyName: string
  logoUrl?: string
  primaryColor: string
  secondaryColor?: string
}

export interface CustomerFeatures {
  maintenanceTracking: boolean
  fuelAnalytics: boolean
  idleAnalysis: boolean
  reportGeneration: boolean
}

// Customer utilities
export const customerUtils = {
  getThemeColors: (config: CustomerConfig) => {
    return {
      primary: config.branding.primaryColor,
      secondary: config.branding.secondaryColor || '#64748b',
      logo: config.branding.logoUrl || '/Kerry Leasing with background.png',
    }
  },

  isFeatureEnabled: (config: CustomerConfig, feature: keyof CustomerFeatures) => {
    return config.features[feature] || false
  },

  getServiceRequestConfig: (config: CustomerConfig) => {
    return config.serviceRequest
  },

  getDataMapping: (config: CustomerConfig) => {
    return config.dataMapping
  },

  generateSlug: (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  },

  validateConfig: (config: Partial<CustomerConfig>) => {
    const errors: string[] = []
    
    if (!config.name) errors.push('Company name is required')
    if (!config.branding?.companyName) errors.push('Branding company name is required')
    if (!config.branding?.primaryColor) errors.push('Primary color is required')
    
    if (config.branding?.primaryColor && !/^#[0-9A-F]{6}$/i.test(config.branding.primaryColor)) {
      errors.push('Primary color must be a valid hex color')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
}
