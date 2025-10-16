'use client'

import { UserButton, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCustomer } from '@/lib/use-customer'
import { FleetVehicle, MaintenanceRecord } from '@/lib/customer-data-service'
import Image from 'next/image'

export default function PortalPage() {
  const { user, isLoaded } = useUser()
  const { customerConfig, dataService, serviceHandler, isLoading: customerLoading, error: customerError } = useCustomer()
  const [fleetData, setFleetData] = useState<FleetVehicle[]>([])
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceRecord[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const router = useRouter()

  // Load customer data when customer config is available
  useEffect(() => {
    async function loadData() {
      if (dataService) {
        setDataLoading(true)
        try {
          const [fleet, maintenance] = await Promise.all([
            dataService.getCustomerFleetData(),
            dataService.getCustomerMaintenanceData()
          ])
          setFleetData(fleet)
          setMaintenanceData(maintenance)
        } catch (error) {
          console.error('Error loading customer data:', error)
        } finally {
          setDataLoading(false)
        }
      }
    }

    loadData()
  }, [dataService])

  // Show loading while checking user and customer config
  if (!isLoaded || !user || customerLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading portal...</p>
        </div>
      </div>
    )
  }

  // Show error if customer config failed to load
  if (customerError || !customerConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Not Configured</h2>
          <p className="text-slate-600 mb-4">
            Your account doesn't have fleet access configured. Please contact support.
          </p>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    )
  }

  // Calculate fleet statistics
  const activeVehicles = fleetData.filter(v => v.status === 'active').length
  const maintenanceVehicles = fleetData.filter(v => v.status === 'maintenance').length
  const upcomingMaintenance = maintenanceData.filter(m => 
    m.status === 'scheduled' && new Date(m.date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  ).length

  const handleServiceRequest = async (vehicleId: string) => {
    if (serviceHandler) {
      const result = await serviceHandler.handleServiceRequest(vehicleId)
      if (result.success && result.redirectUrl) {
        window.open(result.redirectUrl, '_blank')
      }
      // You could show a toast notification here
      console.log(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100">
          {/* Header */}
          <header className="bg-white border-b border-slate-200 shadow-sm">
            <div className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center space-x-4">
                  <Image 
                    src={customerConfig.branding.logoUrl || "/Kerry Leasing with background.png"}
                    alt={`${customerConfig.branding.companyName} Logo`}
                    width={150}
                    height={45}
                    className="h-12 w-auto"
                    priority
                  />
                  <div className="border-l border-slate-300 pl-4">
                    <h1 className="text-lg font-semibold text-slate-800">{customerConfig.name}</h1>
                    <p className="text-sm text-slate-500">Fleet Management</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-slate-700 font-medium">
                    Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}
                  </span>
                  <UserButton afterSignOutUrl="/" />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Fleet Management Portal</h1>
              <p className="text-slate-600">Manage your fleet operations and vehicle maintenance</p>
            </div>

            {/* Loading State */}
            {dataLoading && (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading fleet data...</p>
              </div>
            )}

            {/* Dashboard Cards */}
            {!dataLoading && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {customerConfig.features.fleetOverview && (
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: customerConfig.branding.primaryColor }}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Fleet Overview
                      </CardTitle>
                      <CardDescription>View your fleet statistics and performance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Total Vehicles</span>
                          <span className="font-semibold">{fleetData.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Active Vehicles</span>
                          <span className="font-semibold text-green-600">{activeVehicles}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">In Maintenance</span>
                          <span className="font-semibold text-orange-600">{maintenanceVehicles}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Maintenance Due</span>
                          <span className="font-semibold text-red-600">{upcomingMaintenance}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {customerConfig.features.maintenance && (
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: customerConfig.branding.primaryColor }}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Maintenance
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {customerConfig.features.serviceRequests && serviceHandler?.getServiceRequestConfig().enabled && (
                          <Button 
                            className="w-full"
                            style={{ backgroundColor: customerConfig.branding.primaryColor }}
                            onClick={() => handleServiceRequest('general')}
                          >
                            Request Service
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {customerConfig.features.reports && (
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2" style={{ color: customerConfig.branding.primaryColor }}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Fleet Dashboard
                      </CardTitle>
                      <CardDescription>View detailed fleet analytics and performance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        variant="outline" 
                        className="w-full hover:bg-blue-50"
                        style={{ borderColor: customerConfig.branding.primaryColor, color: customerConfig.branding.primaryColor }}
                        onClick={() => router.push('/portal/dashboard')}
                      >
                        View Dashboard
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}


            {/* Recent Maintenance */}
            {!dataLoading && maintenanceData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Maintenance</CardTitle>
                  <CardDescription>Latest maintenance activities and upcoming services</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {maintenanceData.slice(0, 5).map((maintenance) => (
                      <div key={maintenance.id} className="flex items-center space-x-4 p-3 bg-slate-50 rounded-lg">
                        <div className={`w-3 h-3 rounded-full ${
                          maintenance.status === 'completed' 
                            ? 'bg-green-500'
                            : maintenance.status === 'in_progress'
                            ? 'bg-orange-500'
                            : 'bg-blue-500'
                        }`}></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            Vehicle {maintenance.vehicleId} - {maintenance.description}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1">
                            <span>{maintenance.date.toLocaleDateString()}</span>
                            <span className="capitalize">{maintenance.type}</span>
                            <span className="capitalize">{maintenance.status.replace('_', ' ')}</span>
                            {maintenance.priority === 'high' && (
                              <span className="text-red-600 font-medium">High Priority</span>
                            )}
                          </div>
                        </div>
                        {maintenance.cost && (
                          <div className="text-sm font-medium text-slate-700">
                            ${maintenance.cost.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                    {maintenanceData.length > 5 && (
                      <div className="text-center pt-4">
                        <Button variant="outline">
                          View All Maintenance Records
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Data State */}
            {!dataLoading && fleetData.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No Fleet Data Available</h3>
                  <p className="text-slate-600 mb-4">
                    Fleet data will appear here once your CSV data sources are configured and accessible.
                  </p>
                  <Button variant="outline">
                    Contact Support
                  </Button>
                </CardContent>
              </Card>
            )}
      </main>
    </div>
  )
}