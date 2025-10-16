import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

// Global app state for UI preferences and user settings
interface AppState {
  // UI State
  sidebarCollapsed: boolean
  theme: 'light' | 'dark' | 'system'
  
  // User Preferences (persisted)
  defaultTab: string
  itemsPerPage: number
  
  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setDefaultTab: (tab: string) => void
  setItemsPerPage: (count: number) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        sidebarCollapsed: false,
        theme: 'system',
        defaultTab: 'overview',
        itemsPerPage: 10,
        
        // Actions
        setSidebarCollapsed: (collapsed) => 
          set({ sidebarCollapsed: collapsed }, false, 'setSidebarCollapsed'),
        
        setTheme: (theme) => 
          set({ theme }, false, 'setTheme'),
        
        setDefaultTab: (tab) => 
          set({ defaultTab: tab }, false, 'setDefaultTab'),
        
        setItemsPerPage: (count) => 
          set({ itemsPerPage: count }, false, 'setItemsPerPage'),
      }),
      {
        name: 'kerry-leasing-app-store',
        // Only persist user preferences, not UI state
        partialize: (state) => ({
          theme: state.theme,
          defaultTab: state.defaultTab,
          itemsPerPage: state.itemsPerPage,
        }),
      }
    ),
    {
      name: 'AppStore',
    }
  )
)
