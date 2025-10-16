import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Fleet-specific state for filters, selections, etc.
interface FleetFilters {
  status?: string[]
  search?: string
  dateRange?: {
    start: Date
    end: Date
  }
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface FleetState {
  // Current customer context
  currentCustomerId: string | null
  
  // Filters and search
  filters: FleetFilters
  
  // UI state
  selectedVehicleIds: string[]
  viewMode: 'table' | 'grid' | 'map'
  
  // Actions
  setCurrentCustomerId: (id: string | null) => void
  setFilters: (filters: Partial<FleetFilters>) => void
  clearFilters: () => void
  setSelectedVehicles: (ids: string[]) => void
  toggleVehicleSelection: (id: string) => void
  setViewMode: (mode: 'table' | 'grid' | 'map') => void
}

export const useFleetStore = create<FleetState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentCustomerId: null,
      filters: {},
      selectedVehicleIds: [],
      viewMode: 'table',
      
      // Actions
      setCurrentCustomerId: (id) => 
        set({ currentCustomerId: id }, false, 'setCurrentCustomerId'),
      
      setFilters: (newFilters) => 
        set(
          (state) => ({ 
            filters: { ...state.filters, ...newFilters } 
          }), 
          false, 
          'setFilters'
        ),
      
      clearFilters: () => 
        set({ filters: {} }, false, 'clearFilters'),
      
      setSelectedVehicles: (ids) => 
        set({ selectedVehicleIds: ids }, false, 'setSelectedVehicles'),
      
      toggleVehicleSelection: (id) => 
        set(
          (state) => ({
            selectedVehicleIds: state.selectedVehicleIds.includes(id)
              ? state.selectedVehicleIds.filter(vehicleId => vehicleId !== id)
              : [...state.selectedVehicleIds, id]
          }), 
          false, 
          'toggleVehicleSelection'
        ),
      
      setViewMode: (mode) => 
        set({ viewMode: mode }, false, 'setViewMode'),
    }),
    {
      name: 'FleetStore',
    }
  )
)
