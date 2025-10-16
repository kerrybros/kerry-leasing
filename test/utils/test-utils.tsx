/**
 * Test utilities for consistent testing setup
 */

import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomerProvider } from '@/lib/use-customer'
import { CustomerConfig } from '@/lib/customer-config'

// Mock customer config for testing
export const mockCustomerConfig: CustomerConfig = {
  id: 'test-customer',
  name: 'Test Customer',
  slug: 'test-customer',
  branding: {
    companyName: 'Test Company',
    logoUrl: '/test-logo.png',
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
  },
  features: {
    maintenanceTracking: true,
    fuelAnalytics: true,
    idleAnalysis: true,
    reportGeneration: true,
    fleetOverview: true,
    maintenance: true,
    reports: true,
    serviceRequests: true,
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

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
  customerConfig?: CustomerConfig
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const {
    queryClient = createTestQueryClient(),
    customerConfig = mockCustomerConfig,
    ...renderOptions
  } = options

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <CustomerProvider initialConfig={customerConfig}>
          {children}
        </CustomerProvider>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  }
}

// Mock data generators
export const mockFleetVehicle = (overrides: Partial<any> = {}) => ({
  id: 'test-vehicle-1',
  vehicleNumber: '001',
  make: 'Ford',
  model: 'F-150',
  year: 2022,
  status: 'active' as const,
  mileage: 50000,
  lastService: new Date('2024-01-15'),
  nextService: new Date('2024-04-15'),
  ...overrides,
})

export const mockMaintenanceRecord = (overrides: Partial<any> = {}) => ({
  id: 'test-maintenance-1',
  vehicleId: 'test-vehicle-1',
  vehicleNumber: '001',
  order: 'ORD-001',
  type: 'repair' as const,
  description: 'Oil change and filter replacement',
  serviceDescriptions: ['Oil change', 'Filter replacement'],
  date: new Date('2024-01-15'),
  status: 'completed' as const,
  priority: 'medium' as const,
  ...overrides,
})

export const mockPerformanceData = (overrides: Partial<any> = {}) => ({
  date: '2024-01-15',
  miles: 250,
  fuelUsed: 35.5,
  mpg: 7.0,
  idleTime: 45,
  idlePercent: 12.5,
  ...overrides,
})

// Test helpers
export const waitForLoadingToFinish = () =>
  new Promise((resolve) => setTimeout(resolve, 0))

export const mockFetch = (data: any, ok = true) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  })
}

export const mockFetchError = (error: string) => {
  global.fetch = vi.fn().mockRejectedValue(new Error(error))
}

// Custom matchers
export const customMatchers = {
  toBeValidFleetVehicle: (received: any) => {
    const requiredFields = ['id', 'vehicleNumber', 'make', 'model', 'year', 'status', 'mileage']
    const missingFields = requiredFields.filter(field => !(field in received))
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected object to have fleet vehicle fields. Missing: ${missingFields.join(', ')}`,
        pass: false,
      }
    }
    
    return {
      message: () => 'Expected object not to be a valid fleet vehicle',
      pass: true,
    }
  },
  
  toBeValidMaintenanceRecord: (received: any) => {
    const requiredFields = ['id', 'vehicleId', 'description', 'date', 'status', 'priority']
    const missingFields = requiredFields.filter(field => !(field in received))
    
    if (missingFields.length > 0) {
      return {
        message: () => `Expected object to have maintenance record fields. Missing: ${missingFields.join(', ')}`,
        pass: false,
      }
    }
    
    return {
      message: () => 'Expected object not to be a valid maintenance record',
      pass: true,
    }
  },
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
