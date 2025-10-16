'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useCustomer } from '@/lib/use-customer'
import { MaintenanceRecord } from '@/lib/customer-data-service'
import { useFleetData, useFleetStats } from '@/lib/hooks/use-fleet-data'
import { PortalHeader } from '@/components/layout/portal-header'
import { LoadingState, DataLoadingState } from '@/components/layout/loading-state'
import { ErrorState } from '@/components/layout/error-state'
// import { PortalAdvancedErrorBoundary } from '@/components/errors/advanced-error-boundary'
import { FleetOverviewCard, MaintenanceCard, DashboardCard } from '@/components/dashboard/stats-card'
import { MaintenanceActivity, NoDataState } from '@/components/dashboard/maintenance-activity'

export default function PortalPage() {
  const { user, isLoaded } = useUser()
  const { customerConfig, dataService, serviceHandler, isLoading: customerLoading, error: customerError } = useCustomer()
  const router = useRouter()

  // Use custom hook for data fetching (only when dataService is ready)
  const { fleetData, maintenanceData, loading: dataLoading, error: dataError } = useFleetData(
    dataService && customerConfig ? dataService : null, 
    customerConfig
  )
  
  // Use custom hook for fleet statistics
  const fleetStats = useFleetStats(fleetData, maintenanceData)

  // Memoize service request handler to prevent unnecessary re-renders
  const handleServiceRequest = useCallback(async (vehicleId: string) => {
    if (serviceHandler) {
      const result = await serviceHandler.handleServiceRequest(vehicleId)
      if (result.success && result.redirectUrl) {
        window.open(result.redirectUrl, '_blank')
      }
      // You could show a toast notification here
      console.log(result.message)
    }
  }, [serviceHandler])

  // Show loading while checking user and customer config
  if (!isLoaded || !user || customerLoading) {
    return <LoadingState message="Loading portal..." />
  }

  // Show error if customer config failed to load
  if (customerError || !customerConfig) {
    return <ErrorState />
  }

  // All statistics are now handled by the useFleetStats hook

  return (
    <div>
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100">
        <PortalHeader customerConfig={customerConfig} user={user} />

        {/* Main Content */}
        <main className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Fleet Management Portal</h1>
              <p className="text-slate-600">Manage your fleet operations and vehicle maintenance</p>
            </div>

            {/* Loading State */}
            {dataLoading && <DataLoadingState />}

            {/* Dashboard Cards */}
            {!dataLoading && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {customerConfig.features.fleetOverview && (
                  <FleetOverviewCard
                    totalVehicles={fleetStats.totalVehicles}
                    activeVehicles={fleetStats.activeVehicles}
                    maintenanceVehicles={fleetStats.maintenanceVehicles}
                    upcomingMaintenance={fleetStats.upcomingMaintenance}
                    primaryColor={customerConfig.branding.primaryColor}
                  />
                )}

                {customerConfig.features.maintenance && (
                  <MaintenanceCard
                    onServiceRequest={() => handleServiceRequest('general')}
                    primaryColor={customerConfig.branding.primaryColor}
                    serviceRequestEnabled={customerConfig.features.serviceRequests && serviceHandler?.getServiceRequestConfig().enabled}
                  />
                )}

                {customerConfig.features.reports && (
                  <DashboardCard
                    onViewDashboard={() => router.push('/portal/dashboard')}
                    primaryColor={customerConfig.branding.primaryColor}
                  />
                )}
              </div>
            )}


            {/* Recent Maintenance */}
            <MaintenanceActivity 
              recentMaintenanceData={fleetStats.recentMaintenanceData}
              totalMaintenanceCount={maintenanceData.length}
            />

            {/* No Data State */}
            {!dataLoading && fleetStats.totalVehicles === 0 && <NoDataState />}
        </main>
      </div>
    </div>
  )
}