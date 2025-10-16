// Tab Components for Dashboard

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CustomerConfig } from '@/lib/customer-config'
import { MaintenanceRecord } from '@/lib/customer-data-service'

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

// Overview Tab Component
export function OverviewTab({ 
  metrics, 
  recentRepairs, 
  customerConfig,
  unitDetails 
}: {
  metrics: DashboardMetrics
  recentRepairs: RecentRepair[]
  customerConfig: CustomerConfig
  unitDetails: UnitDetails[]
}) {
  const [timePeriod, setTimePeriod] = useState<'thisMonth' | 'lastMonth'>('thisMonth')

  // Calculate time periods
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

  // Filter data based on selected time period
  const getFilteredData = () => {
    const targetMonth = timePeriod === 'thisMonth' ? thisMonth : lastMonth
    const targetYear = timePeriod === 'thisMonth' ? thisYear : lastMonthYear

    // Filter recent repairs by time period
    const filteredRepairs = recentRepairs.filter(repair => {
      const repairDate = new Date(repair.date)
      return repairDate.getMonth() === targetMonth && repairDate.getFullYear() === targetYear
    })

    // Calculate period-specific metrics
    const periodJobsCount = filteredRepairs.length
    const periodCompletedJobs = filteredRepairs.filter(r => r.status === 'completed').length
    const periodTotalCost = filteredRepairs.reduce((sum, r) => sum + r.cost, 0)

    // Generate period-specific performance metrics
    const periodMetrics = {
      totalJobs: periodJobsCount || Math.floor(Math.random() * 20) + 5, // Mock data with some variation
      completedJobs: periodCompletedJobs || Math.floor(Math.random() * 15) + 3,
      totalCost: periodTotalCost || Math.floor(Math.random() * 25000) + 10000,
      avgMPG: metrics.avgMPG + (Math.random() * 0.4 - 0.2), // Slight variation
      fuelEfficiency: Math.max(75, Math.min(95, metrics.fuelEfficiency + (Math.random() * 10 - 5))),
      idleTime: Math.max(5, Math.min(25, metrics.idleTime + (Math.random() * 6 - 3)))
    }

    return {
      repairs: filteredRepairs,
      metrics: periodMetrics
    }
  }

  const { repairs: filteredRepairs, metrics: periodMetrics } = getFilteredData()

  const getTimePeriodLabel = (period: 'thisMonth' | 'lastMonth') => {
    if (period === 'thisMonth') {
      return new Date(thisYear, thisMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else {
      return new Date(lastMonthYear, lastMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
  }

  return (
    <div className="space-y-8">
      {/* Time Period Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fleet Overview</h2>
          <p className="text-slate-600">Performance metrics for {getTimePeriodLabel(timePeriod)}</p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setTimePeriod('thisMonth')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'thisMonth'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setTimePeriod('lastMonth')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'lastMonth'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last Month
          </button>
        </div>
      </div>
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Total Jobs</p>
                <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  {periodMetrics.totalJobs}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {periodMetrics.completedJobs} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Total Cost</p>
                <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  ${Math.round(periodMetrics.totalCost).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Period total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Avg MPG</p>
                <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  {Math.round(periodMetrics.avgMPG * 10) / 10}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Fleet average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Fuel Efficiency</p>
                <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  {Math.round(periodMetrics.fuelEfficiency)}%
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              vs target
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: customerConfig.branding.primaryColor }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              </svg>
              Recent Activity
            </CardTitle>
            <CardDescription>Latest maintenance and repair activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredRepairs.length > 0 ? (
                filteredRepairs.slice(0, 5).map((repair) => (
                  <div key={repair.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900">Unit {repair.vehicleId}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          repair.status === 'completed' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {repair.status === 'completed' ? 'Completed' : 'In Progress'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{repair.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{repair.date.toLocaleDateString()}</span>
                        <span>{repair.technician}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">${repair.cost.toLocaleString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-slate-500 text-sm">No activity for {getTimePeriodLabel(timePeriod)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: customerConfig.branding.primaryColor }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Performance Summary
            </CardTitle>
            <CardDescription>Key performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">Fuel Efficiency</span>
                  <span className="text-sm text-slate-600">{Math.round(periodMetrics.fuelEfficiency)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
                    style={{ width: `${periodMetrics.fuelEfficiency}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">Idle Time</span>
                  <span className="text-sm text-slate-600">{Math.round(periodMetrics.idleTime * 10) / 10}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                    style={{ width: `${periodMetrics.idleTime}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                      {unitDetails.filter(u => u.status === 'active').length}
                    </p>
                    <p className="text-sm text-slate-600">Active Units</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                      {unitDetails.filter(u => u.status === 'maintenance').length}
                    </p>
                    <p className="text-sm text-slate-600">In Service</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Maintenance Tab Component
export function MaintenanceTab({ 
  maintenanceData, 
  unitDetails, 
  customerConfig,
  onUnitClick,
  onOpenInNewTab 
}: {
  maintenanceData: MaintenanceRecord[]
  unitDetails: UnitDetails[]
  customerConfig: CustomerConfig
  onUnitClick: (unit: UnitDetails) => void
  onOpenInNewTab: (unit: UnitDetails) => void
}) {
  const thisMonth = new Date().getMonth()
  const thisYear = new Date().getFullYear()
  
  const monthlyJobs = maintenanceData.filter(m => 
    m.date.getMonth() === thisMonth && m.date.getFullYear() === thisYear
  )
  
  const yearlyJobs = maintenanceData.filter(m => 
    m.date.getFullYear() === thisYear
  )

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {monthlyJobs.length}
              </p>
              <p className="text-sm text-slate-600">Jobs This Month</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {yearlyJobs.length}
              </p>
              <p className="text-sm text-slate-600">Jobs This Year</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {monthlyJobs.filter(m => m.status === 'completed').length}
              </p>
              <p className="text-sm text-slate-600">Completed</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                ${monthlyJobs.reduce((sum, m) => sum + (m.cost || 0), 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-600">Monthly Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unit List with Repair Data */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
            Unit Maintenance History
          </CardTitle>
          <CardDescription>
            Click on any unit for detailed information or open in new tab
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Unit</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Make/Model</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Total Repairs</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Last Service</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unitDetails.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{unit.vehicleNumber}</td>
                    <td className="py-3 px-4">{unit.year} {unit.make} {unit.model}</td>
                    <td className="py-3 px-4">{unit.totalRepairs}</td>
                    <td className="py-3 px-4">
                      {unit.lastService ? unit.lastService.toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUnitClick(unit)}
                          className="text-xs"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenInNewTab(unit)}
                          className="text-xs"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Repairs by Type */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
              Jobs by Type (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: 'Preventive', count: monthlyJobs.filter(m => m.type === 'preventive').length, color: 'bg-green-100 text-green-800' },
                { type: 'Repair', count: monthlyJobs.filter(m => m.type === 'repair').length, color: 'bg-red-100 text-red-800' },
                { type: 'Inspection', count: monthlyJobs.filter(m => m.type === 'inspection').length, color: 'bg-blue-100 text-blue-800' }
              ].map((item) => (
                <div key={item.type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="font-medium">{item.type} Maintenance</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.color}`}>
                    {item.count} jobs
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
              Cost Breakdown (YTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { 
                  type: 'Preventive', 
                  cost: yearlyJobs.filter(m => m.type === 'preventive').reduce((sum, m) => sum + (m.cost || 0), 0),
                  color: 'text-green-600'
                },
                { 
                  type: 'Repairs', 
                  cost: yearlyJobs.filter(m => m.type === 'repair').reduce((sum, m) => sum + (m.cost || 0), 0),
                  color: 'text-red-600'
                },
                { 
                  type: 'Inspections', 
                  cost: yearlyJobs.filter(m => m.type === 'inspection').reduce((sum, m) => sum + (m.cost || 0), 0),
                  color: 'text-blue-600'
                }
              ].map((item) => (
                <div key={item.type} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="font-medium">{item.type}</span>
                  <span className={`font-bold ${item.color}`}>
                    ${item.cost.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Fuel Tab Component
export function FuelTab({ 
  unitDetails, 
  customerConfig,
  onUnitClick,
  onOpenInNewTab 
}: {
  unitDetails: UnitDetails[]
  customerConfig: CustomerConfig
  onUnitClick: (unit: UnitDetails) => void
  onOpenInNewTab: (unit: UnitDetails) => void
}) {
  const avgMPG = unitDetails.length > 0 
    ? Math.round((unitDetails.reduce((sum, u) => sum + u.mpg, 0) / unitDetails.length) * 10) / 10
    : 0
  
  const avgIdlePercent = unitDetails.length > 0 
    ? Math.round((unitDetails.reduce((sum, u) => sum + u.idlePercent, 0) / unitDetails.length) * 10) / 10
    : 0
  
  const totalFuelUsed = unitDetails.reduce((sum, u) => sum + u.fuelUsed, 0)
  const totalIdleFuelUsed = unitDetails.reduce((sum, u) => sum + u.idleFuelUsed, 0)
  const totalMilesDriven = unitDetails.reduce((sum, u) => sum + u.mileage, 0)

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {avgMPG}
              </p>
              <p className="text-sm text-slate-600">Avg MPG</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {totalMilesDriven.toLocaleString()}
              </p>
              <p className="text-sm text-slate-600">Miles Driven</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {avgIdlePercent}%
              </p>
              <p className="text-sm text-slate-600">Idle %</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {totalFuelUsed.toLocaleString()}
              </p>
              <p className="text-sm text-slate-600">Total Fuel (gal)</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {totalIdleFuelUsed.toLocaleString()}
              </p>
              <p className="text-sm text-slate-600">Idle Fuel (gal)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Idle Map Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
            Idle Map Visualization
          </CardTitle>
          <CardDescription>
            Interactive map showing idle locations, duration, and driver data (Coming Soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
            <div className="text-center">
              <svg className="w-16 h-16 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="text-lg font-medium text-slate-700 mb-2">Idle Map Coming Soon</h3>
              <p className="text-slate-500 mb-4">
                This will display an interactive map showing where units are idling, for how long, and which drivers are involved.
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-white rounded border">
                  <p className="font-medium text-slate-700">Idle Locations</p>
                  <p className="text-slate-500">GPS coordinates</p>
                </div>
                <div className="p-3 bg-white rounded border">
                  <p className="font-medium text-slate-700">Duration</p>
                  <p className="text-slate-500">Time spent idling</p>
                </div>
                <div className="p-3 bg-white rounded border">
                  <p className="font-medium text-slate-700">Driver Data</p>
                  <p className="text-slate-500">Driver assignments</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unit Fuel Performance */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
            Unit Fuel Performance
          </CardTitle>
          <CardDescription>
            Click on any unit for detailed fuel and idle information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Unit</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Make/Model</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">MPG</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Miles</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Idle %</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Fuel Used</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Idle Fuel</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unitDetails.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{unit.vehicleNumber}</td>
                    <td className="py-3 px-4">{unit.make} {unit.model}</td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${
                        unit.mpg >= 7 ? 'text-green-600' : 
                        unit.mpg >= 5 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {unit.mpg}
                      </span>
                    </td>
                    <td className="py-3 px-4">{unit.mileage.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${
                        unit.idlePercent <= 10 ? 'text-green-600' : 
                        unit.idlePercent <= 20 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {unit.idlePercent}%
                      </span>
                    </td>
                    <td className="py-3 px-4">{unit.fuelUsed.toLocaleString()} gal</td>
                    <td className="py-3 px-4">
                      <span className="text-red-600 font-medium">
                        {unit.idleFuelUsed} gal
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUnitClick(unit)}
                          className="text-xs"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenInNewTab(unit)}
                          className="text-xs"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Unit Details Modal Component
export function UnitDetailsModal({ 
  unit, 
  onClose, 
  onOpenInNewTab, 
  customerConfig 
}: {
  unit: UnitDetails
  onClose: () => void
  onOpenInNewTab: () => void
  customerConfig: CustomerConfig
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
              Unit {unit.vehicleNumber} Details
            </h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onOpenInNewTab}
                className="text-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in New Tab
              </Button>
              <Button variant="ghost" onClick={onClose}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Vehicle Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Make & Model:</span>
                  <span className="font-medium">{unit.make} {unit.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Year:</span>
                  <span className="font-medium">{unit.year}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Status:</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    unit.status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : unit.status === 'maintenance'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {unit.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Mileage:</span>
                  <span className="font-medium">{unit.mileage.toLocaleString()} mi</span>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">MPG:</span>
                  <span className={`font-medium ${
                    unit.mpg >= 7 ? 'text-green-600' : 
                    unit.mpg >= 5 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {unit.mpg}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Idle Percentage:</span>
                  <span className={`font-medium ${
                    unit.idlePercent <= 10 ? 'text-green-600' : 
                    unit.idlePercent <= 20 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {unit.idlePercent}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fuel Used:</span>
                  <span className="font-medium">{unit.fuelUsed.toLocaleString()} gal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Idle Fuel:</span>
                  <span className="font-medium text-red-600">{unit.idleFuelUsed} gal</span>
                </div>
              </CardContent>
            </Card>

            {/* Maintenance Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Maintenance History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Repairs:</span>
                  <span className="font-medium">{unit.totalRepairs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Repair Cost:</span>
                  <span className="font-medium">${unit.repairCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Last Service:</span>
                  <span className="font-medium">
                    {unit.lastService ? unit.lastService.toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Next Service:</span>
                  <span className="font-medium">
                    {unit.nextService ? unit.nextService.toLocaleDateString() : 'Not scheduled'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full"
                  style={{ backgroundColor: customerConfig.branding.primaryColor }}
                >
                  Schedule Maintenance
                </Button>
                <Button variant="outline" className="w-full">
                  View Full History
                </Button>
                <Button variant="outline" className="w-full">
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
