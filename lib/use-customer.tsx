'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { CustomerConfig, customerConfigs } from './customer-config'
import { CustomerDataService } from './customer-data-service'
import { ServiceRequestHandler } from './service-request-handler'

interface CustomerContextType {
  customerConfig: CustomerConfig | null
  dataService: CustomerDataService | null
  serviceHandler: ServiceRequestHandler | null
  isLoading: boolean
  error: string | null
}

const CustomerContext = createContext<CustomerContextType>({
  customerConfig: null,
  dataService: null,
  serviceHandler: null,
  isLoading: true,
  error: null
})

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()
  const [customerConfig, setCustomerConfig] = useState<CustomerConfig | null>(null)
  const [dataService, setDataService] = useState<CustomerDataService | null>(null)
  const [serviceHandler, setServiceHandler] = useState<ServiceRequestHandler | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && user) {
      try {
        // Determine customer based on user metadata or email
        const userMetadata = user.publicMetadata as { customerId?: string }
        const email = user.emailAddresses[0]?.emailAddress
        
        let config: CustomerConfig | null = null

        // Method 1: Direct customer ID in metadata
        if (userMetadata.customerId && customerConfigs[userMetadata.customerId]) {
          config = customerConfigs[userMetadata.customerId]
        }
        // Method 2: Match by email domain
        else if (email) {
          // Find config where email domain matches
          config = Object.values(customerConfigs).find(cfg => {
            // Add email domain matching logic here
            if (email.includes('abc-trucking.com')) return cfg.id === 'abc-trucking'
            if (email.includes('xyz-logistics.com')) return cfg.id === 'xyz-logistics'
            if (email.includes('kerrybrotherstruckrepair.com')) return cfg.id === 'kerry-brothers'
            if (email.includes('wolverinepacking.com')) return cfg.id === 'wolverine'
            return false
          }) || null
        }
        
        // Method 3: Default fallback for testing - use Wolverine for demo
        if (!config && Object.keys(customerConfigs).length > 0) {
          // Using Wolverine config as default for demo
          config = customerConfigs['wolverine'] || Object.values(customerConfigs)[0]
        }

        if (config) {
          setCustomerConfig(config)
          setDataService(new CustomerDataService(config))
          setServiceHandler(new ServiceRequestHandler(config))
          setError(null)
        } else {
          setError('No customer configuration found for this user')
        }
      } catch (err) {
        setError('Failed to load customer configuration')
        console.error('Customer config error:', err)
      } finally {
        setIsLoading(false)
      }
    }
  }, [isLoaded, user])

  return (
    <CustomerContext.Provider value={{
      customerConfig,
      dataService,
      serviceHandler,
      isLoading,
      error
    }}>
      {children}
    </CustomerContext.Provider>
  )
}

export function useCustomer() {
  const context = useContext(CustomerContext)
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider')
  }
  return context
}
