'use client'

import { use, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCustomer } from '@/lib/use-customer'
import NextImage from 'next/image'

// Import tab components
import { MaintenanceTab, PerformanceTab } from '@/components/unit-tabs'
import { IdleAnalysisTab } from '@/components/idle-analysis-tab'

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

interface MaintenanceRecord {
  id: string
  vehicleId: string
  order: string
  type: 'preventive' | 'repair' | 'inspection'
  description: string
  serviceDescriptions: string[]
  date: Date
  status: 'completed' | 'in_progress' | 'scheduled'
  priority: 'low' | 'medium' | 'high'
  laborHours?: number
}

interface PerformanceData {
  date: string
  miles: number
  fuelUsed: number
  mpg: number
  idleTime: number
  idlePercent: number
}

type TabType = 'maintenance' | 'performance' | 'idle'

function UnitDetailPageContent({ params }: { params: Promise<{ vehicleNumber: string }> }) {
  const resolvedParams = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { customerConfig } = useCustomer()
  
  // Get initial tab from URL or default to maintenance
  const getInitialTab = useCallback((): TabType => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['maintenance', 'performance', 'idle'].includes(tabParam)) {
      return tabParam as TabType
    }
    return 'maintenance'
  }, [searchParams])
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab())
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([])
  const [unit, setUnit] = useState<UnitDetails | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Memoize unit number to prevent unnecessary re-renders
  const unitNumber = useMemo(() => resolvedParams.vehicleNumber, [resolvedParams.vehicleNumber])
  
  // Clean up URL by removing data parameter if present
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('data')) {
      url.searchParams.delete('data')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // Memoize the data fetching function
  const fetchUnitAndMaintenanceData = useCallback(async () => {
      if (!customerConfig) return
      
      setLoading(true)
      try {
        // Use the CustomerDataService to get real unit and maintenance data
        const { CustomerDataService } = await import('@/lib/customer-data-service')
        const dataService = new CustomerDataService(customerConfig)
        
        // Fetch fleet vehicles and find the specific unit
        const fleetVehicles = await dataService.getCustomerFleetData()
        const foundUnit = fleetVehicles.find(v => v.vehicleNumber === unitNumber)
        
        if (foundUnit) {
          // Convert FleetVehicle to UnitDetails format using real data
          const unitDetails = {
            id: foundUnit.id,
            vehicleNumber: foundUnit.vehicleNumber,
            make: foundUnit.make,
            model: foundUnit.model,
            year: foundUnit.year,
            status: foundUnit.status,
            mileage: foundUnit.mileage,
            mpg: Math.round((5.5 + Math.random() * 3) * 10) / 10, // Keep mock for now
            idlePercent: Math.round((8 + Math.random() * 15) * 10) / 10, // Keep mock for now
            fuelUsed: Math.floor(15000 + Math.random() * 10000), // Keep mock for now
            idleFuelUsed: Math.floor(800 + Math.random() * 400), // Keep mock for now
            totalRepairs: 0, // No mock data - will be calculated from real maintenance records
            repairCost: 0, // No mock data
            lastService: foundUnit.lastService || new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000),
            nextService: foundUnit.nextService || new Date(Date.now() + Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000)
          }
          setUnit(unitDetails)
        } else {
          console.warn(`Unit ${unitNumber} not found in fleet data, using fallback`)
          // Fallback to mock data if unit not found
          const fallbackUnit = {
            id: unitNumber,
            vehicleNumber: unitNumber,
            make: 'Unknown',
            model: 'Unknown',
            year: new Date().getFullYear(),
            status: 'active',
            mileage: 0,
            mpg: 6.5,
            idlePercent: 12,
            fuelUsed: 20000,
            idleFuelUsed: 1000,
            totalRepairs: 0, // No mock data
            repairCost: 0, // No mock data
            lastService: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            nextService: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          }
          setUnit(fallbackUnit)
        }
        
        // Fetch maintenance records for this specific unit
        const allMaintenanceRecords = await dataService.getCustomerMaintenanceData()
        
        const unitMaintenanceRecords = allMaintenanceRecords.filter(record => {
          // Handle different unit number formats from CSV
          const recordUnit = record.vehicleId || record.vehicleNumber || ''
          const cleanRecordUnit = recordUnit.replace(/^="|"$/g, '').trim()
          const finalRecordUnit = cleanRecordUnit.startsWith('=') ? cleanRecordUnit.substring(1) : cleanRecordUnit
          
          // Check multiple possible matches
          return recordUnit === unitNumber || 
                 cleanRecordUnit === unitNumber || 
                 finalRecordUnit === unitNumber ||
                 record.vehicleNumber === unitNumber
        })
        
        // Only use real maintenance records, no mock data
        setMaintenanceRecords(unitMaintenanceRecords)
        
      } catch (error) {
        console.error('Error fetching unit/maintenance data:', error)
        // Fallback to mock data on error
        const errorFallbackUnit = {
          id: unitNumber,
          vehicleNumber: unitNumber,
          make: 'Unknown',
          model: 'Unknown',
          year: new Date().getFullYear(),
          status: 'active',
          mileage: 0,
          mpg: 6.5,
          idlePercent: 12,
          fuelUsed: 20000,
          idleFuelUsed: 1000,
          totalRepairs: 0, // No mock data
          repairCost: 0, // No mock data
          lastService: new Date(),
          nextService: new Date()
        }
        setUnit(errorFallbackUnit)
        // No mock maintenance records - leave blank if no real data
        setMaintenanceRecords([])
      }
      
      // Always generate mock performance data for now (as requested)
      generateMockPerformanceData()
      setLoading(false)
    }, [unitNumber, customerConfig])

  // Use effect with memoized function
  useEffect(() => {
    fetchUnitAndMaintenanceData()
  }, [fetchUnitAndMaintenanceData])

    const generateMockPerformanceData = () => {
      const data: PerformanceData[] = []
      const baseDate = new Date()
      
      for (let i = 30; i >= 0; i--) {
        const date = new Date(baseDate)
        date.setDate(date.getDate() - i)
        
        const dailyMiles = Math.floor(Math.random() * 600) + 200
        const dailyMPG = Math.max(4, Math.min(10, 6.5 + (Math.random() * 2 - 1)))
        const fuelUsed = Math.round((dailyMiles / dailyMPG) * 10) / 10
        const idleTime = Math.floor(Math.random() * 180) + 30 // 30-210 minutes
        const idlePercent = Math.round((idleTime / (8 * 60)) * 100 * 10) / 10 // % of 8-hour day
        
        data.push({
          date: date.toISOString().split('T')[0],
          miles: dailyMiles,
          fuelUsed,
          mpg: dailyMPG,
          idleTime,
          idlePercent
        })
      }
      
      setPerformanceData(data)
    }

  // Memoize tab change handler
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.pushState({}, '', url.toString())
  }, [])

  // Memoize individual tab handlers
  const handleMaintenanceTab = useCallback(() => handleTabChange('maintenance'), [handleTabChange])
  const handlePerformanceTab = useCallback(() => handleTabChange('performance'), [handleTabChange])
  const handleIdleTab = useCallback(() => handleTabChange('idle'), [handleTabChange])

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const newTab = getInitialTab()
      setActiveTab(newTab)
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [searchParams, getInitialTab])

  if (!customerConfig || loading || !unit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Loading...</h2>
          <p className="text-slate-600 mb-4">Setting up unit details.</p>
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
                onClick={() => router.push('/portal/dashboard')}
                className="text-slate-600 hover:text-slate-800"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
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
                <h1 className="text-lg font-semibold text-slate-800">Unit {unit.vehicleNumber}</h1>
                <p className="text-sm text-slate-500">{unit.make} {unit.model} ({unit.year})</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
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
                Maintenance
              </div>
            </button>
            <button
              onClick={() => handleTabChange('performance')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'performance'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Performance
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
          <IdleAnalysisTab 
            isFleetView={false}
            vehicleNumber={unitNumber}
            customerConfig={customerConfig}
          />
        </main>
      ) : (
        // Wider layout for other tabs (75-80% width)
        <main className="max-w-[80vw] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'maintenance' && (
            <MaintenanceTab 
              unit={unit} 
              maintenanceRecords={maintenanceRecords}
              customerConfig={customerConfig}
            />
          )}
          
          {activeTab === 'performance' && (
            <PerformanceTab 
              unit={unit} 
              performanceData={performanceData}
              customerConfig={customerConfig}
            />
          )}
        </main>
      )}
    </div>
  )
}

export default function UnitDetailPage({ params }: { params: Promise<{ vehicleNumber: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UnitDetailPageContent params={params} />
    </Suspense>
  )
}
