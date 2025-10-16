import React from 'react'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/**
 * Unified loading state management for the entire application
 */

export interface LoadingState {
  id: string
  message: string
  progress?: number
  startTime: Date
  category: LoadingCategory
  priority: LoadingPriority
}

export enum LoadingCategory {
  DATA_FETCH = 'DATA_FETCH',
  USER_ACTION = 'USER_ACTION',
  NAVIGATION = 'NAVIGATION',
  FILE_UPLOAD = 'FILE_UPLOAD',
  AUTHENTICATION = 'AUTHENTICATION',
  BACKGROUND = 'BACKGROUND'
}

export enum LoadingPriority {
  LOW = 'LOW',       // Background operations
  MEDIUM = 'MEDIUM', // Normal user actions
  HIGH = 'HIGH',     // Critical operations
  CRITICAL = 'CRITICAL' // Blocking operations
}

interface LoadingStore {
  // State
  loadingStates: Map<string, LoadingState>
  globalLoading: boolean
  
  // Actions
  startLoading: (id: string, message: string, options?: {
    category?: LoadingCategory
    priority?: LoadingPriority
    progress?: number
  }) => void
  
  updateLoading: (id: string, updates: {
    message?: string
    progress?: number
  }) => void
  
  stopLoading: (id: string) => void
  
  stopAllLoading: () => void
  
  // Getters
  isLoading: (id?: string) => boolean
  getLoadingState: (id: string) => LoadingState | undefined
  getLoadingStates: () => LoadingState[]
  getHighPriorityLoading: () => LoadingState[]
  getLoadingByCategory: (category: LoadingCategory) => LoadingState[]
}

export const useLoadingStore = create<LoadingStore>()(
  subscribeWithSelector((set, get) => ({
    loadingStates: new Map(),
    globalLoading: false,

    startLoading: (id, message, options = {}) => {
      const loadingState: LoadingState = {
        id,
        message,
        startTime: new Date(),
        category: options.category || LoadingCategory.USER_ACTION,
        priority: options.priority || LoadingPriority.MEDIUM,
        progress: options.progress
      }

      set((state) => {
        const newStates = new Map(state.loadingStates)
        newStates.set(id, loadingState)
        
        return {
          loadingStates: newStates,
          globalLoading: newStates.size > 0
        }
      })
    },

    updateLoading: (id, updates) => {
      set((state) => {
        const newStates = new Map(state.loadingStates)
        const existingState = newStates.get(id)
        
        if (existingState) {
          newStates.set(id, { ...existingState, ...updates })
        }
        
        return { loadingStates: newStates }
      })
    },

    stopLoading: (id) => {
      set((state) => {
        const newStates = new Map(state.loadingStates)
        newStates.delete(id)
        
        return {
          loadingStates: newStates,
          globalLoading: newStates.size > 0
        }
      })
    },

    stopAllLoading: () => {
      set({
        loadingStates: new Map(),
        globalLoading: false
      })
    },

    isLoading: (id) => {
      const state = get()
      return id ? state.loadingStates.has(id) : state.globalLoading
    },

    getLoadingState: (id) => {
      return get().loadingStates.get(id)
    },

    getLoadingStates: () => {
      return Array.from(get().loadingStates.values())
    },

    getHighPriorityLoading: () => {
      return Array.from(get().loadingStates.values())
        .filter(state => 
          state.priority === LoadingPriority.HIGH || 
          state.priority === LoadingPriority.CRITICAL
        )
        .sort((a, b) => {
          const priorityOrder = {
            [LoadingPriority.CRITICAL]: 4,
            [LoadingPriority.HIGH]: 3,
            [LoadingPriority.MEDIUM]: 2,
            [LoadingPriority.LOW]: 1
          }
          return priorityOrder[b.priority] - priorityOrder[a.priority]
        })
    },

    getLoadingByCategory: (category) => {
      return Array.from(get().loadingStates.values())
        .filter(state => state.category === category)
    }
  }))
)

/**
 * Hook for managing loading states with automatic cleanup
 */
export function useLoadingManager() {
  const store = useLoadingStore()

  const startLoading = (id: string, message: string, options?: {
    category?: LoadingCategory
    priority?: LoadingPriority
    progress?: number
  }) => {
    store.startLoading(id, message, options)
    
    // Return cleanup function
    return () => store.stopLoading(id)
  }

  const withLoading = async <T>(
    id: string,
    message: string,
    asyncOperation: () => Promise<T>,
    options?: {
      category?: LoadingCategory
      priority?: LoadingPriority
      onProgress?: (progress: number) => void
    }
  ): Promise<T> => {
    store.startLoading(id, message, options)
    
    try {
      const result = await asyncOperation()
      return result
    } finally {
      store.stopLoading(id)
    }
  }

  const withProgressLoading = async <T>(
    id: string,
    message: string,
    asyncOperation: (updateProgress: (progress: number, message?: string) => void) => Promise<T>,
    options?: {
      category?: LoadingCategory
      priority?: LoadingPriority
    }
  ): Promise<T> => {
    store.startLoading(id, message, { ...options, progress: 0 })
    
    const updateProgress = (progress: number, newMessage?: string) => {
      store.updateLoading(id, { 
        progress: Math.max(0, Math.min(100, progress)),
        ...(newMessage && { message: newMessage })
      })
    }
    
    try {
      const result = await asyncOperation(updateProgress)
      return result
    } finally {
      store.stopLoading(id)
    }
  }

  return {
    // Basic operations
    startLoading,
    updateLoading: store.updateLoading,
    stopLoading: store.stopLoading,
    stopAllLoading: store.stopAllLoading,
    
    // Advanced operations
    withLoading,
    withProgressLoading,
    
    // State queries
    isLoading: store.isLoading,
    getLoadingState: store.getLoadingState,
    getLoadingStates: store.getLoadingStates,
    getHighPriorityLoading: store.getHighPriorityLoading,
    getLoadingByCategory: store.getLoadingByCategory,
    
    // Computed states
    globalLoading: store.globalLoading,
    hasHighPriorityLoading: () => store.getHighPriorityLoading().length > 0,
    getActiveLoadingCount: () => store.getLoadingStates().length
  }
}

/**
 * Hook for automatic loading cleanup on component unmount
 */
export function useAutoCleanupLoading(id: string) {
  const { stopLoading } = useLoadingManager()
  
  React.useEffect(() => {
    return () => stopLoading(id)
  }, [id, stopLoading])
}

/**
 * Loading state constants for common operations
 */
export const LOADING_IDS = {
  // Data operations
  FLEET_DATA: 'fleet-data',
  MAINTENANCE_DATA: 'maintenance-data',
  USER_DATA: 'user-data',
  CUSTOMER_CONFIG: 'customer-config',
  
  // User actions
  SERVICE_REQUEST: 'service-request',
  FORM_SUBMIT: 'form-submit',
  FILE_UPLOAD: 'file-upload',
  
  // Navigation
  PAGE_LOAD: 'page-load',
  ROUTE_CHANGE: 'route-change',
  
  // Authentication
  SIGN_IN: 'sign-in',
  SIGN_OUT: 'sign-out',
  TOKEN_REFRESH: 'token-refresh'
} as const

/**
 * Loading messages for common operations
 */
export const LOADING_MESSAGES = {
  FLEET_DATA: 'Loading fleet data...',
  MAINTENANCE_DATA: 'Loading maintenance records...',
  USER_DATA: 'Loading user information...',
  CUSTOMER_CONFIG: 'Loading configuration...',
  SERVICE_REQUEST: 'Submitting service request...',
  FORM_SUBMIT: 'Saving changes...',
  FILE_UPLOAD: 'Uploading file...',
  PAGE_LOAD: 'Loading page...',
  ROUTE_CHANGE: 'Navigating...',
  SIGN_IN: 'Signing in...',
  SIGN_OUT: 'Signing out...',
  TOKEN_REFRESH: 'Refreshing session...'
} as const
