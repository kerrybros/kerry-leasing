import { FleetVehicle, MaintenanceRecord, CustomerConfig } from '@/lib/schemas'

// Base API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api'

// API Error class for better error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Base API client with proper error handling
class BaseApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData.code,
          errorData.details
        )
      }

      const data = await response.json()
      return data
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      
      // Network or other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error occurred',
        0,
        'NETWORK_ERROR'
      )
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const searchParams = params ? new URLSearchParams(params) : null
    const url = searchParams ? `${endpoint}?${searchParams}` : endpoint
    
    return this.request<T>(url, {
      method: 'GET',
    })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }
}

// Create singleton instance
export const apiClient = new BaseApiClient()

// Fleet API service
export const fleetApi = {
  async getVehicles(customerId: string, filters?: Record<string, string>): Promise<FleetVehicle[]> {
    return apiClient.get<FleetVehicle[]>(`/fleet/${customerId}/vehicles`, filters)
  },

  async getVehicle(customerId: string, vehicleId: string): Promise<FleetVehicle> {
    return apiClient.get<FleetVehicle>(`/fleet/${customerId}/vehicles/${vehicleId}`)
  },

  async updateVehicle(customerId: string, vehicleId: string, data: Partial<FleetVehicle>): Promise<FleetVehicle> {
    return apiClient.put<FleetVehicle>(`/fleet/${customerId}/vehicles/${vehicleId}`, data)
  },

  async createVehicle(customerId: string, data: Omit<FleetVehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<FleetVehicle> {
    return apiClient.post<FleetVehicle>(`/fleet/${customerId}/vehicles`, data)
  },

  async deleteVehicle(customerId: string, vehicleId: string): Promise<void> {
    return apiClient.delete<void>(`/fleet/${customerId}/vehicles/${vehicleId}`)
  },
}

// Maintenance API service
export const maintenanceApi = {
  async getRecords(customerId: string, vehicleId?: string): Promise<MaintenanceRecord[]> {
    const endpoint = vehicleId 
      ? `/maintenance/${customerId}/records?vehicleId=${vehicleId}`
      : `/maintenance/${customerId}/records`
    return apiClient.get<MaintenanceRecord[]>(endpoint)
  },

  async getRecord(customerId: string, recordId: string): Promise<MaintenanceRecord> {
    return apiClient.get<MaintenanceRecord>(`/maintenance/${customerId}/records/${recordId}`)
  },

  async createRecord(customerId: string, data: Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MaintenanceRecord> {
    return apiClient.post<MaintenanceRecord>(`/maintenance/${customerId}/records`, data)
  },

  async updateRecord(customerId: string, recordId: string, data: Partial<MaintenanceRecord>): Promise<MaintenanceRecord> {
    return apiClient.put<MaintenanceRecord>(`/maintenance/${customerId}/records/${recordId}`, data)
  },

  async deleteRecord(customerId: string, recordId: string): Promise<void> {
    return apiClient.delete<void>(`/maintenance/${customerId}/records/${recordId}`)
  },
}

// Customer API service
export const customerApi = {
  async getConfig(customerId: string): Promise<CustomerConfig> {
    return apiClient.get<CustomerConfig>(`/customers/${customerId}/config`)
  },

  async updateConfig(customerId: string, data: Partial<CustomerConfig>): Promise<CustomerConfig> {
    return apiClient.put<CustomerConfig>(`/customers/${customerId}/config`, data)
  },
}

// Export all APIs
export const api = {
  fleet: fleetApi,
  maintenance: maintenanceApi,
  customer: customerApi,
}
