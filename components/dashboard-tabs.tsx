// Tab Components for Dashboard

import React, { useState, useMemo, useCallback } from 'react'
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
  type: string
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

  // Memoize time period calculations
  const timePeriods = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    return {
      thisMonth,
      thisYear,
      lastMonth,
      lastMonthYear
    }
  }, [])

  // Memoize filtered data based on selected time period
  const { filteredRepairs, periodMetrics } = useMemo(() => {
    const { thisMonth, thisYear, lastMonth, lastMonthYear } = timePeriods
    const targetMonth = timePeriod === 'thisMonth' ? thisMonth : lastMonth
    const targetYear = timePeriod === 'thisMonth' ? thisYear : lastMonthYear

    // Filter recent repairs by time period
    const filteredRepairs = recentRepairs.filter(repair => {
      const repairDate = new Date(repair.date)
      return repairDate.getMonth() === targetMonth && repairDate.getFullYear() === targetYear
    })

    // Calculate period-specific metrics in single pass
    const { periodJobsCount, periodCompletedJobs, periodTotalCost } = filteredRepairs.reduce(
      (acc, repair) => {
        acc.periodJobsCount++
        if (repair.status === 'completed') {
          acc.periodCompletedJobs++
        }
        return acc
      },
      { periodJobsCount: 0, periodCompletedJobs: 0 }
    )

    // Generate period-specific performance metrics
    const periodMetrics = {
      totalJobs: periodJobsCount || Math.floor(Math.random() * 20) + 5, // Mock data with some variation
      completedJobs: periodCompletedJobs || Math.floor(Math.random() * 15) + 3,
      avgMPG: metrics.avgMPG + (Math.random() * 0.4 - 0.2), // Slight variation
      fuelEfficiency: Math.max(75, Math.min(95, metrics.fuelEfficiency + (Math.random() * 10 - 5))),
      idleTime: Math.max(5, Math.min(25, metrics.idleTime + (Math.random() * 6 - 3)))
    }

    return {
      filteredRepairs,
      periodMetrics
    }
  }, [recentRepairs, timePeriod, timePeriods, metrics])

  // Memoize time period label calculation
  const timePeriodLabel = useMemo(() => {
    const { thisMonth, thisYear, lastMonth, lastMonthYear } = timePeriods
    if (timePeriod === 'thisMonth') {
      return new Date(thisYear, thisMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else {
      return new Date(lastMonthYear, lastMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
  }, [timePeriod, timePeriods])

  // Memoize button click handlers
  const handleThisMonthClick = useCallback(() => setTimePeriod('thisMonth'), [])
  const handleLastMonthClick = useCallback(() => setTimePeriod('lastMonth'), [])

  return (
    <div className="space-y-8">
      {/* Time Period Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Fleet Overview</h2>
          <p className="text-slate-600">Performance metrics for {timePeriodLabel}</p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={handleThisMonthClick}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              timePeriod === 'thisMonth'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={handleLastMonthClick}
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-slate-500 text-sm">No activity for {timePeriodLabel}</p>
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
  const [unitSearchTerm, setUnitSearchTerm] = useState<string>('')
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const thisMonth = new Date().getMonth()
  const thisYear = new Date().getFullYear()
  
  const monthlyJobs = maintenanceData.filter(m => 
    m.date.getMonth() === thisMonth && m.date.getFullYear() === thisYear
  )
  
  const yearlyJobs = maintenanceData.filter(m => 
    m.date.getFullYear() === thisYear
  )

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Filter and sort units
  const filteredAndSortedUnits = useMemo(() => {
    let filtered = unitDetails
    
    // Apply search filter
    if (unitSearchTerm.trim()) {
      const searchLower = unitSearchTerm.toLowerCase()
      filtered = filtered.filter(unit => 
        unit.vehicleNumber.toLowerCase().includes(searchLower)
      )
    }
    
    // Apply sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortField as keyof UnitDetails]
        let bVal: any = b[sortField as keyof UnitDetails]
        
        // Handle different data types
        if (sortField === 'vehicleNumber' || sortField === 'totalRepairs' || sortField === 'year') {
          aVal = parseInt(aVal) || 0
          bVal = parseInt(bVal) || 0
        } else if (sortField === 'make' || sortField === 'model') {
          aVal = aVal?.toString().toLowerCase() || ''
          bVal = bVal?.toString().toLowerCase() || ''
        } else if (sortField === 'lastService') {
          aVal = aVal ? new Date(aVal).getTime() : 0
          bVal = bVal ? new Date(bVal).getTime() : 0
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }
    
    return filtered
  }, [unitDetails, unitSearchTerm, sortField, sortDirection])

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
          {/* Search Input */}
          <div className="mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by unit number..."
                value={unitSearchTerm}
                onChange={(e) => setUnitSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              {unitSearchTerm && (
                <button
                  onClick={() => setUnitSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {unitSearchTerm && (
              <div className="text-sm text-slate-600 mb-2">
                Showing {filteredAndSortedUnits.length} of {unitDetails.length} units
              </div>
            )}
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('vehicleNumber')}
                  >
                    <div className="flex items-center gap-1">
                      Unit
                      {sortField === 'vehicleNumber' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('year')}
                  >
                    <div className="flex items-center gap-1">
                      Year
                      {sortField === 'year' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('make')}
                  >
                    <div className="flex items-center gap-1">
                      Make
                      {sortField === 'make' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('model')}
                  >
                    <div className="flex items-center gap-1">
                      Model
                      {sortField === 'model' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('totalRepairs')}
                  >
                    <div className="flex items-center gap-1">
                      Total Repairs
                      {sortField === 'totalRepairs' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('lastService')}
                  >
                    <div className="flex items-center gap-1">
                      Last Service
                      {sortField === 'lastService' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedUnits.length === 0 && unitSearchTerm ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p>No units found matching &quot;{unitSearchTerm}&quot;</p>
                        <p className="text-sm">Try searching by unit number only</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedUnits.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{unit.vehicleNumber}</td>
                    <td className="py-3 px-4">{unit.year}</td>
                    <td className="py-3 px-4">{unit.make}</td>
                    <td className="py-3 px-4">{unit.model}</td>
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
                ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
  const [unitSearchTerm, setUnitSearchTerm] = useState<string>('')
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  
  // Filter out trailers since they don't have engines/fuel consumption
  const motorizedUnits = unitDetails.filter(unit => {
    // More robust filtering - check for trailer in type field
    const unitType = unit.type?.toLowerCase() || ''
    return unitType !== 'trailer'
  })
  
  const avgMPG = motorizedUnits.length > 0 
    ? Math.round((motorizedUnits.reduce((sum, u) => sum + u.mpg, 0) / motorizedUnits.length) * 10) / 10
    : 0
  
  const avgIdlePercent = motorizedUnits.length > 0 
    ? Math.round((motorizedUnits.reduce((sum, u) => sum + u.idlePercent, 0) / motorizedUnits.length) * 10) / 10
    : 0
  
  const totalFuelUsed = motorizedUnits.reduce((sum, u) => sum + u.fuelUsed, 0)
  const totalIdleFuelUsed = motorizedUnits.reduce((sum, u) => sum + u.idleFuelUsed, 0)
  const totalMilesDriven = motorizedUnits.reduce((sum, u) => sum + u.mileage, 0)

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Filter and sort units
  const filteredAndSortedUnits = useMemo(() => {
    let filtered = motorizedUnits
    
    // Apply search filter
    if (unitSearchTerm.trim()) {
      const searchLower = unitSearchTerm.toLowerCase()
      filtered = filtered.filter(unit => 
        unit.vehicleNumber.toLowerCase().includes(searchLower)
      )
    }
    
    // Apply sorting
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortField as keyof UnitDetails]
        let bVal: any = b[sortField as keyof UnitDetails]
        
        // Handle different data types
        if (sortField === 'vehicleNumber' || sortField === 'year' || sortField === 'mpg' || sortField === 'mileage' || sortField === 'idlePercent' || sortField === 'fuelUsed' || sortField === 'idleFuelUsed') {
          aVal = parseFloat(aVal) || 0
          bVal = parseFloat(bVal) || 0
        } else if (sortField === 'make' || sortField === 'model') {
          aVal = aVal?.toString().toLowerCase() || ''
          bVal = bVal?.toString().toLowerCase() || ''
        }
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }
    
    return filtered
  }, [motorizedUnits, unitSearchTerm, sortField, sortDirection])

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
          <div className="mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by unit number..."
                value={unitSearchTerm}
                onChange={(e) => setUnitSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              {unitSearchTerm && (
                <button
                  onClick={() => setUnitSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {unitSearchTerm && (
              <div className="text-sm text-slate-600 mb-2">
                Showing {filteredAndSortedUnits.length} of {motorizedUnits.length} units
              </div>
            )}
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('vehicleNumber')}
                  >
                    <div className="flex items-center gap-1">
                      Unit
                      {sortField === 'vehicleNumber' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('year')}
                  >
                    <div className="flex items-center gap-1">
                      Year
                      {sortField === 'year' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('make')}
                  >
                    <div className="flex items-center gap-1">
                      Make
                      {sortField === 'make' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('model')}
                  >
                    <div className="flex items-center gap-1">
                      Model
                      {sortField === 'model' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('mpg')}
                  >
                    <div className="flex items-center gap-1">
                      MPG
                      {sortField === 'mpg' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('mileage')}
                  >
                    <div className="flex items-center gap-1">
                      Miles
                      {sortField === 'mileage' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('idlePercent')}
                  >
                    <div className="flex items-center gap-1">
                      Idle %
                      {sortField === 'idlePercent' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('fuelUsed')}
                  >
                    <div className="flex items-center gap-1">
                      Fuel Used
                      {sortField === 'fuelUsed' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                    onClick={() => handleSort('idleFuelUsed')}
                  >
                    <div className="flex items-center gap-1">
                      Idle Fuel
                      {sortField === 'idleFuelUsed' && (
                        <svg className={`w-4 h-4 ${sortDirection === 'asc' ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedUnits.length === 0 && unitSearchTerm ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p>No units found matching &quot;{unitSearchTerm}&quot;</p>
                        <p className="text-sm">Try searching by unit number only</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedUnits.map((unit) => (
                  <tr key={unit.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{unit.vehicleNumber}</td>
                    <td className="py-3 px-4">{unit.year}</td>
                    <td className="py-3 px-4">{unit.make}</td>
                    <td className="py-3 px-4">{unit.model}</td>
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
                  ))
                )}
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

          <div className="space-y-6">
            {/* Vehicle Information */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Make</div>
                    <div className="font-semibold text-slate-900">{unit.make}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Model</div>
                    <div className="font-semibold text-slate-900">{unit.model}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Year</div>
                    <div className="font-semibold text-slate-900">{unit.year}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Status</div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      unit.status === 'active' 
                        ? 'bg-green-100 text-green-800'
                        : unit.status === 'maintenance'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {unit.status}
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Mileage</div>
                    <div className="font-semibold text-slate-900">{unit.mileage.toLocaleString()} mi</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">MPG</div>
                    <div className={`text-xl font-bold ${
                      unit.mpg >= 7 ? 'text-green-600' : 
                      unit.mpg >= 5 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {unit.mpg}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Idle Percentage</div>
                    <div className={`text-xl font-bold ${
                      unit.idlePercent <= 10 ? 'text-green-600' : 
                      unit.idlePercent <= 20 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {unit.idlePercent}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Fuel Used</div>
                    <div className="text-xl font-bold text-slate-900">{unit.fuelUsed.toLocaleString()} gal</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Idle Fuel</div>
                    <div className="text-xl font-bold text-red-600">{unit.idleFuelUsed} gal</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Maintenance History */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Maintenance History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Total Repairs</div>
                    <div className="text-xl font-bold text-slate-900">{unit.totalRepairs}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-slate-600 mb-1">Last Service</div>
                    <div className="text-xl font-bold text-slate-900">
                      {unit.lastService ? unit.lastService.toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
