import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fleetApi, maintenanceApi, customerApi } from '@/lib/services/api'
import { FleetVehicle, MaintenanceRecord, CustomerConfig } from '@/lib/schemas'
import { useFleetStore } from '@/lib/stores/fleet-store'

// Query Keys - centralized for cache management
export const queryKeys = {
  // Customer queries
  customer: (id: string) => ['customer', id] as const,
  customerConfig: (id: string) => ['customer', id, 'config'] as const,
  
  // Fleet queries
  fleet: (customerId: string) => ['fleet', customerId] as const,
  fleetVehicles: (customerId: string, filters?: Record<string, string>) => 
    ['fleet', customerId, 'vehicles', filters] as const,
  fleetVehicle: (customerId: string, vehicleId: string) => 
    ['fleet', customerId, 'vehicles', vehicleId] as const,
  
  // Maintenance queries
  maintenance: (customerId: string) => ['maintenance', customerId] as const,
  maintenanceRecords: (customerId: string, vehicleId?: string) => 
    ['maintenance', customerId, 'records', vehicleId] as const,
  maintenanceRecord: (customerId: string, recordId: string) => 
    ['maintenance', customerId, 'records', recordId] as const,
}

// Customer hooks
export function useCustomerConfig(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customerConfig(customerId),
    queryFn: () => customerApi.getConfig(customerId),
    enabled: !!customerId,
    staleTime: 1000 * 60 * 10, // 10 minutes - config doesn't change often
    retry: 1, // Only retry once for config
  })
}

// Fleet hooks
export function useFleetVehicles(customerId: string, filters?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.fleetVehicles(customerId, filters),
    queryFn: () => fleetApi.getVehicles(customerId, filters),
    enabled: !!customerId,
    staleTime: 1000 * 60 * 2, // 2 minutes - fleet data changes moderately
  })
}

export function useFleetVehicle(customerId: string, vehicleId: string) {
  return useQuery({
    queryKey: queryKeys.fleetVehicle(customerId, vehicleId),
    queryFn: () => fleetApi.getVehicle(customerId, vehicleId),
    enabled: !!customerId && !!vehicleId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Maintenance hooks
export function useMaintenanceRecords(customerId: string, vehicleId?: string) {
  return useQuery({
    queryKey: queryKeys.maintenanceRecords(customerId, vehicleId),
    queryFn: () => maintenanceApi.getRecords(customerId, vehicleId),
    enabled: !!customerId,
    staleTime: 1000 * 60 * 1, // 1 minute - maintenance data is more dynamic
  })
}

export function useMaintenanceRecord(customerId: string, recordId: string) {
  return useQuery({
    queryKey: queryKeys.maintenanceRecord(customerId, recordId),
    queryFn: () => maintenanceApi.getRecord(customerId, recordId),
    enabled: !!customerId && !!recordId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Mutation hooks with optimistic updates
export function useUpdateVehicle() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ customerId, vehicleId, data }: {
      customerId: string
      vehicleId: string
      data: Partial<FleetVehicle>
    }) => fleetApi.updateVehicle(customerId, vehicleId, data),
    
    onMutate: async ({ customerId, vehicleId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.fleetVehicle(customerId, vehicleId) })
      
      // Snapshot previous value
      const previousVehicle = queryClient.getQueryData<FleetVehicle>(
        queryKeys.fleetVehicle(customerId, vehicleId)
      )
      
      // Optimistically update
      if (previousVehicle) {
        queryClient.setQueryData<FleetVehicle>(
          queryKeys.fleetVehicle(customerId, vehicleId),
          { ...previousVehicle, ...data }
        )
      }
      
      return { previousVehicle }
    },
    
    onError: (err, { customerId, vehicleId }, context) => {
      // Rollback on error
      if (context?.previousVehicle) {
        queryClient.setQueryData(
          queryKeys.fleetVehicle(customerId, vehicleId),
          context.previousVehicle
        )
      }
    },
    
    onSettled: (data, error, { customerId, vehicleId }) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.fleetVehicle(customerId, vehicleId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.fleetVehicles(customerId) })
    },
  })
}

export function useCreateVehicle() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ customerId, data }: {
      customerId: string
      data: Omit<FleetVehicle, 'id' | 'createdAt' | 'updatedAt'>
    }) => fleetApi.createVehicle(customerId, data),
    
    onSuccess: (newVehicle, { customerId }) => {
      // Add to fleet vehicles cache
      queryClient.setQueryData<FleetVehicle[]>(
        queryKeys.fleetVehicles(customerId),
        (old) => old ? [...old, newVehicle] : [newVehicle]
      )
    },
  })
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ customerId, vehicleId }: {
      customerId: string
      vehicleId: string
    }) => fleetApi.deleteVehicle(customerId, vehicleId),
    
    onSuccess: (_, { customerId, vehicleId }) => {
      // Remove from fleet vehicles cache
      queryClient.setQueryData<FleetVehicle[]>(
        queryKeys.fleetVehicles(customerId),
        (old) => old ? old.filter(vehicle => vehicle.id !== vehicleId) : []
      )
      
      // Remove individual vehicle cache
      queryClient.removeQueries({ queryKey: queryKeys.fleetVehicle(customerId, vehicleId) })
    },
  })
}

export function useCreateMaintenanceRecord() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ customerId, data }: {
      customerId: string
      data: Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
    }) => maintenanceApi.createRecord(customerId, data),
    
    onSuccess: (newRecord, { customerId }) => {
      // Invalidate maintenance records
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceRecords(customerId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceRecords(customerId, newRecord.vehicleId) })
    },
  })
}

export function useUpdateMaintenanceRecord() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ customerId, recordId, data }: {
      customerId: string
      recordId: string
      data: Partial<MaintenanceRecord>
    }) => maintenanceApi.updateRecord(customerId, recordId, data),
    
    onSuccess: (updatedRecord, { customerId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceRecords(customerId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceRecord(customerId, updatedRecord.id) })
    },
  })
}

// Compound hooks for common use cases
export function useVehicleWithMaintenance(customerId: string, vehicleId: string) {
  const vehicleQuery = useFleetVehicle(customerId, vehicleId)
  const maintenanceQuery = useMaintenanceRecords(customerId, vehicleId)
  
  return {
    vehicle: vehicleQuery.data,
    maintenance: maintenanceQuery.data,
    isLoading: vehicleQuery.isLoading || maintenanceQuery.isLoading,
    error: vehicleQuery.error || maintenanceQuery.error,
    refetch: () => {
      vehicleQuery.refetch()
      maintenanceQuery.refetch()
    },
  }
}

// Hook to get current customer from store and fetch config
export function useCurrentCustomer() {
  const currentCustomerId = useFleetStore(state => state.currentCustomerId)
  const configQuery = useCustomerConfig(currentCustomerId || '')
  
  return {
    customerId: currentCustomerId,
    config: configQuery.data,
    isLoading: configQuery.isLoading,
    error: configQuery.error,
  }
}
