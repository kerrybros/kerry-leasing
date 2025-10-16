'use client'

import { UserButton, useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCustomer } from '@/lib/use-customer'
import { FleetVehicle, MaintenanceRecord } from '@/lib/customer-data-service'
import { OverviewTab, MaintenanceTab, FuelTab, UnitDetailsModal } from '@/components/dashboard-tabs'
import { IdleAnalysisTab } from '@/components/idle-analysis-tab'
import NextImage from 'next/image'

interface DashboardMetrics {
  totalJobs: number
  completedJobs: number
  avgMPG: number
  fuelEfficiency: number
  idleTime: number
  totalMilesDriven: number
}

interface RecentRepair {
  id: string
  vehicleId: string
  description: string
  cost: number
  date: Date
  status: 'completed' | 'in_progress'
  technician: string
}

interface UnitDetails {
  id: string
  vehicleNumber: string
  make: string
  model: string
  year: number
  status: string
  mileage: number
  mpg: number
  idlePercent: number
  fuelUsed: number
  idleFuelUsed: number
  totalRepairs: number
  repairCost: number
  lastService: Date | null
  nextService: Date | null
}

type TabType = 'overview' | 'maintenance' | 'fuel' | 'idle'

export default function DashboardPage() {
  const { user, isLoaded } = useUser()
  const { customerConfig, dataService, isLoading: customerLoading, error: customerError } = useCustomer()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Get initial tab from URL or default to overview
  const getInitialTab = useCallback((): TabType => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['overview', 'maintenance', 'fuel', 'idle'].includes(tabParam)) {
      return tabParam as TabType
    }
    return 'overview'
  }, [searchParams])
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab())
  const [fleetData, setFleetData] = useState<FleetVehicle[]>([])
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceRecord[]>([])
  const [unitDetails, setUnitDetails] = useState<UnitDetails[]>([])
  const [selectedUnit, setSelectedUnit] = useState<UnitDetails | null>(null)
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalJobs: 0,
    completedJobs: 0,
    avgMPG: 0,
    fuelEfficiency: 0,
    idleTime: 0,
    totalMilesDriven: 0
  })
  const [recentRepairs, setRecentRepairs] = useState<RecentRepair[]>([])
  const [dataLoading, setDataLoading] = useState(true)

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
          
          // Generate mock metrics based on real data
          const totalMiles = fleet.reduce((sum, vehicle) => sum + (vehicle.mileage || 0), 0)
          const activeVehicles = fleet.filter(v => v.status === 'active').length
          const completedMaintenance = maintenance.filter(m => m.status === 'completed').length
          
          setMetrics({
            totalJobs: maintenance.length,
            completedJobs: completedMaintenance,
            avgMPG: activeVehicles > 0 ? Math.round((6.5 + Math.random() * 2) * 10) / 10 : 0,
            fuelEfficiency: activeVehicles > 0 ? Math.round((85 + Math.random() * 10) * 10) / 10 : 0,
            idleTime: Math.round((12 + Math.random() * 8) * 10) / 10,
            totalMilesDriven: totalMiles
          })

          // Generate recent repairs from maintenance data
          const repairs: RecentRepair[] = maintenance
            .filter(m => m.type === 'repair')
            .slice(0, 8)
            .map(m => ({
              id: m.id,
              vehicleId: m.vehicleId,
              description: m.description,
              cost: Math.round((200 + Math.random() * 1500) * 100) / 100, // Mock cost since removed from MaintenanceRecord
              date: m.date,
              status: m.status === 'completed' ? 'completed' : 'in_progress',
              technician: ['Mike Johnson', 'Sarah Chen', 'Dave Rodriguez', 'Alex Thompson'][Math.floor(Math.random() * 4)]
            }))
          
          setRecentRepairs(repairs)

          // Generate detailed unit data
          const units: UnitDetails[] = fleet.map(vehicle => ({
            id: vehicle.id,
            vehicleNumber: vehicle.vehicleNumber,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            status: vehicle.status,
            mileage: vehicle.mileage || 0,
            mpg: Math.round((5.5 + Math.random() * 3) * 10) / 10,
            idlePercent: Math.round((8 + Math.random() * 15) * 10) / 10,
            fuelUsed: Math.round((vehicle.mileage || 0) / (5.5 + Math.random() * 3)),
            idleFuelUsed: Math.round((25 + Math.random() * 50) * 10) / 10,
            totalRepairs: maintenance.filter(m => m.vehicleId === vehicle.vehicleNumber).length,
            repairCost: maintenance
              .filter(m => m.vehicleId === vehicle.vehicleNumber)
              .reduce((sum, m) => sum + (m.cost || 0), 0),
            lastService: vehicle.lastService ? new Date(vehicle.lastService) : null,
            nextService: vehicle.nextService ? new Date(vehicle.nextService) : null
          }))
          
          setUnitDetails(units)
        } catch (error) {
          console.error('Error loading customer data:', error)
        } finally {
          setDataLoading(false)
        }
      }
    }

    loadData()
  }, [dataService])

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.pushState({}, '', url.toString())
  }

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const newTab = getInitialTab()
      setActiveTab(newTab)
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [searchParams, getInitialTab])

  const openUnitInNewTab = (unit: UnitDetails) => {
    // Create URL with unit data
    const unitUrl = `/portal/dashboard/unit/${unit.vehicleNumber}?data=${encodeURIComponent(JSON.stringify(unit))}`
    window.open(unitUrl, '_blank')
  }

  const openUnitModal = (unit: UnitDetails) => {
    setSelectedUnit(unit)
    setShowUnitModal(true)
  }

  // Show loading while checking user and customer config
  if (!isLoaded || !user || customerLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading dashboard...</p>
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
            Your account doesn&apos;t have fleet access configured. Please contact support.
          </p>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/portal')}
                className="text-slate-600 hover:text-slate-800"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Portal
              </Button>
              <div className="border-l border-slate-300 pl-4">
                <NextImage 
                  src={customerConfig.branding.logoUrl || "/Kerry Leasing with background.png"}
                  alt={`${customerConfig.branding.companyName} Logo`}
                  width={120}
                  height={36}
                  className="h-10 w-auto"
                  priority
                />
              </div>
              <div className="border-l border-slate-300 pl-4">
                <h1 className="text-lg font-semibold text-slate-800">Fleet Dashboard</h1>
                <p className="text-sm text-slate-500">{customerConfig.name}</p>
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

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => handleTabChange('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Overview
              </div>
            </button>
            <button
              onClick={() => handleTabChange('maintenance')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'maintenance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
                Repair & Maintenance
              </div>
            </button>
            <button
              onClick={() => handleTabChange('fuel')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'fuel'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Idle / MPG / Fuel
              </div>
            </button>
            <button
              onClick={() => handleTabChange('idle')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'idle'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Idle Analysis
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'idle' ? (
        // Full-width layout for Idle Analysis
        <main className="h-[calc(100vh-8rem)] overflow-hidden">
          {!dataLoading && (
            <IdleAnalysisTab 
              isFleetView={true}
              customerConfig={customerConfig}
            />
          )}
        </main>
      ) : (
        // Wider layout for other tabs (75-80% width)
        <main className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {dataLoading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600">Loading dashboard data...</p>
            </div>
          )}

          {!dataLoading && (
            <div className="space-y-8">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <OverviewTab 
                  metrics={metrics} 
                  recentRepairs={recentRepairs} 
                  customerConfig={customerConfig}
                  unitDetails={unitDetails}
                />
              )}

              {/* Maintenance Tab */}
              {activeTab === 'maintenance' && (
                <MaintenanceTab 
                  maintenanceData={maintenanceData}
                  unitDetails={unitDetails}
                  customerConfig={customerConfig}
                  onUnitClick={openUnitModal}
                  onOpenInNewTab={openUnitInNewTab}
                />
              )}

              {/* Fuel Tab */}
              {activeTab === 'fuel' && (
                <FuelTab 
                  unitDetails={unitDetails}
                  customerConfig={customerConfig}
                  onUnitClick={openUnitModal}
                  onOpenInNewTab={openUnitInNewTab}
                />
              )}
            </div>
          )}
        </main>
      )}

      {/* Unit Details Modal */}
      {showUnitModal && selectedUnit && (
        <UnitDetailsModal 
          unit={selectedUnit}
          onClose={() => setShowUnitModal(false)}
          onOpenInNewTab={() => openUnitInNewTab(selectedUnit)}
          customerConfig={customerConfig}
        />
      )}
    </div>
  )
}
