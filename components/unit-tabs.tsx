// Tab Components for Unit Details

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
}

interface PerformanceData {
  date: string
  miles: number
  fuelUsed: number
  mpg: number
  idleTime: number
  idlePercent: number
}

// Maintenance Tab Component for Unit Details
export function MaintenanceTab({ 
  unit, 
  maintenanceRecords, 
  customerConfig 
}: {
  unit: UnitDetails
  maintenanceRecords: MaintenanceRecord[]
  customerConfig: any
}) {
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null)
  
  const completedRecords = maintenanceRecords.filter(r => r.status === 'completed')

  // Calculate YTD and this month repair counts - ALL orders are repairs
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()
  
  const ytdRepairs = completedRecords.filter(r => 
    r.date.getFullYear() === currentYear
  ).length // All completed orders are repairs
  
  const thisMonthRepairs = completedRecords.filter(r => 
    r.date.getFullYear() === currentYear && 
    r.date.getMonth() === currentMonth
  ).length // All completed orders are repairs

  // Calculate repair statistics

  const handleRecordClick = (record: MaintenanceRecord) => {
    setSelectedRecord(record)
  }

  const closeModal = () => {
    setSelectedRecord(null)
  }

  return (
    <div className="space-y-6">
      {/* Top Section: Summary and Unit Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Maintenance Summary - Left Side */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg" style={{ color: customerConfig.branding.primaryColor }}>
              Maintenance Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-4">
            <div>
              <span className="text-slate-600 text-sm">Last LOF Date:</span>
              <div className="font-medium">Not Available</div>
            </div>
            </div>
            {/* Repair Counts inside Summary */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  {ytdRepairs}
                </p>
                <p className="text-xs text-slate-600">Repairs YTD</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                  {thisMonthRepairs}
                </p>
                <p className="text-xs text-slate-600">Repairs This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unit Details - Right Side */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg" style={{ color: customerConfig.branding.primaryColor }}>
              Unit Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-600">Make/Model:</span>
                <div className="font-medium">{unit.make} {unit.model}</div>
              </div>
              <div>
                <span className="text-slate-600">Year:</span>
                <div className="font-medium">{unit.year}</div>
              </div>
              <div>
                <span className="text-slate-600">Unit #:</span>
                <div className="font-medium">{unit.vehicleNumber}</div>
              </div>
              <div>
                <span className="text-slate-600">Current Mileage:</span>
                <div className="font-medium">{unit.mileage.toLocaleString()} mi</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Records - Full Width & Compact */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg" style={{ color: customerConfig.branding.primaryColor }}>
            Maintenance History
          </CardTitle>
          <CardDescription className="text-sm">Complete repair and service history</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {maintenanceRecords.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {maintenanceRecords.map((record) => (
                <div 
                  key={record.id} 
                  className="border border-slate-200 rounded-lg p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => handleRecordClick(record)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        repair
                      </span>
                      {record.priority === 'high' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          High Priority
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        {record.date.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <h4 className="font-medium text-slate-900 text-sm mb-1">Service Work Completed</h4>
                  
                  <div className="text-xs text-slate-600">
                    <p>Click to view service details ({record.serviceDescriptions?.length || 0} items)</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-slate-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm">No maintenance records available</p>
              <p className="text-slate-400 text-xs mt-1">Maintenance history will appear here when available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                        Service Details
                      </h2>
                      <p className="text-slate-600 text-sm">
                        {selectedRecord.date.toLocaleDateString()}
                      </p>
                    </div>
                <Button variant="ghost" onClick={closeModal}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Service Descriptions</h3>
                  <div className="space-y-3">
                    {selectedRecord.serviceDescriptions && selectedRecord.serviceDescriptions.map((description, index) => (
                      <div key={index} className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-blue-600 text-xs font-medium">{index + 1}</span>
                          </div>
                          <p className="text-slate-700 text-sm leading-relaxed">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Performance Tab Component for Unit Details
export function PerformanceTab({ 
  unit, 
  performanceData, 
  customerConfig 
}: {
  unit: UnitDetails
  performanceData: PerformanceData[]
  customerConfig: any
}) {
  // Date filter state
  const [dateFilter, setDateFilter] = useState<'ytd' | 'last-year' | 'this-month' | 'last-month' | 'last-30-days'>('last-30-days')
  
  // Helper function to filter data based on selected date range
  const filterDataByDate = (data: PerformanceData[]) => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    
    return data.filter(item => {
      const itemDate = new Date(item.date)
      
      switch (dateFilter) {
        case 'ytd':
          return itemDate.getFullYear() === currentYear
        case 'last-year':
          return itemDate.getFullYear() === currentYear - 1
        case 'this-month':
          return itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        case 'last-month':
          const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
          return itemDate.getFullYear() === lastMonthYear && itemDate.getMonth() === lastMonth
        case 'last-30-days':
        default:
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
          return itemDate >= thirtyDaysAgo
      }
    })
  }
  
  // Get filtered data
  const filteredData = filterDataByDate(performanceData)
  
  // Calculate metrics based on filtered data
  const totalMiles = filteredData.reduce((sum, d) => sum + d.miles, 0)
  const totalFuel = filteredData.reduce((sum, d) => sum + d.fuelUsed, 0)
  const avgMPG = totalMiles / totalFuel || 0
  const avgIdlePercent = filteredData.length > 0 ? filteredData.reduce((sum, d) => sum + d.idlePercent, 0) / filteredData.length : 0
  const totalIdleTime = filteredData.reduce((sum, d) => sum + d.idleTime, 0)
  
  // Get date range label for display
  const getDateRangeLabel = () => {
    switch (dateFilter) {
      case 'ytd': return 'YTD'
      case 'last-year': return 'Last Year'
      case 'this-month': return 'This Month'
      case 'last-month': return 'Last Month'
      case 'last-30-days': return 'Last 30 Days'
      default: return 'Last 30 Days'
    }
  }

  return (
    <div className="space-y-8">
      {/* Date Filter Dropdown */}
      <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">Performance Analytics</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Time Period:</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors min-w-[140px]"
          >
            <option value="last-30-days">Last 30 Days</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="ytd">Year to Date</option>
            <option value="last-year">Last Year</option>
          </select>
        </div>
      </div>
      {/* Performance KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {Math.round(avgMPG * 10) / 10}
              </p>
              <p className="text-sm text-slate-600">Avg MPG</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {totalMiles.toLocaleString()}
              </p>
              <p className="text-sm text-slate-600">Miles ({getDateRangeLabel()})</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {Math.round(totalFuel)}
              </p>
              <p className="text-sm text-slate-600">Fuel Used ({getDateRangeLabel()})</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {Math.round(avgIdlePercent * 10) / 10}%
              </p>
              <p className="text-sm text-slate-600">Avg Idle %</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: customerConfig.branding.primaryColor }}>
                {Math.round(totalIdleTime / 60)}h
              </p>
              <p className="text-sm text-slate-600">Total Idle Time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Daily Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
              Daily Performance ({getDateRangeLabel()})
            </CardTitle>
            <CardDescription>Miles driven and fuel efficiency trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between space-x-1">
              {filteredData.slice(-14).map((day, index) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div className="relative w-full">
                    {/* Miles Bar */}
                    <div 
                      className="bg-blue-500 w-full rounded-t"
                      style={{ height: `${(day.miles / 800) * 120}px` }}
                      title={`${day.miles} miles`}
                    ></div>
                    {/* MPG Bar */}
                    <div 
                      className="bg-green-500 w-full"
                      style={{ height: `${(day.mpg / 10) * 60}px` }}
                      title={`${day.mpg} MPG`}
                    ></div>
                  </div>
                  <span className="text-xs text-slate-500 mt-1 transform -rotate-45">
                    {new Date(day.date).getDate()}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-center space-x-4 mt-4">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
                <span className="text-sm text-slate-600">Miles</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                <span className="text-sm text-slate-600">MPG</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Idle Analysis */}
        <Card>
          <CardHeader>
            <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
              Idle Analysis
            </CardTitle>
            <CardDescription>Idle time patterns and efficiency</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-700">Average Idle Percentage</span>
                  <span className={`text-lg font-bold ${
                    avgIdlePercent <= 15 ? 'text-green-600' : 
                    avgIdlePercent <= 25 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {Math.round(avgIdlePercent * 10) / 10}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full ${
                      avgIdlePercent <= 15 ? 'bg-green-500' : 
                      avgIdlePercent <= 25 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(avgIdlePercent * 2, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700">Best Day</p>
                  <p className="text-lg font-bold text-green-600">
                    {filteredData.length > 0 ? Math.min(...filteredData.map(d => d.idlePercent)).toFixed(1) : '0.0'}%
                  </p>
                  {filteredData.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      ({filteredData.find(d => d.idlePercent === Math.min(...filteredData.map(d => d.idlePercent)))?.date ? 
                        new Date(filteredData.find(d => d.idlePercent === Math.min(...filteredData.map(d => d.idlePercent)))!.date).toLocaleDateString() : 
                        'N/A'})
                    </p>
                  )}
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700">Worst Day</p>
                  <p className="text-lg font-bold text-red-600">
                    {filteredData.length > 0 ? Math.max(...filteredData.map(d => d.idlePercent)).toFixed(1) : '0.0'}%
                  </p>
                  {filteredData.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      ({filteredData.find(d => d.idlePercent === Math.max(...filteredData.map(d => d.idlePercent)))?.date ? 
                        new Date(filteredData.find(d => d.idlePercent === Math.max(...filteredData.map(d => d.idlePercent)))!.date).toLocaleDateString() : 
                        'N/A'})
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Idle Insights</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Total idle time: {Math.round(totalIdleTime / 60)} hours</li>
                  <li>• Estimated idle fuel cost: ${Math.round(totalIdleTime * 0.8 * 3.5)}</li>
                  <li>• {avgIdlePercent <= 15 ? 'Excellent idle management' : avgIdlePercent <= 25 ? 'Room for improvement' : 'High idle time - review needed'}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Performance Table */}
      <Card>
        <CardHeader>
            <CardTitle style={{ color: customerConfig.branding.primaryColor }}>
              Daily Performance Log ({getDateRangeLabel()})
            </CardTitle>
          <CardDescription>Detailed daily performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Miles</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Fuel Used</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">MPG</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Idle Time</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Idle %</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(-10).reverse().map((day) => (
                  <tr key={day.date} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">{new Date(day.date).toLocaleDateString()}</td>
                    <td className="py-3 px-4 font-medium">{day.miles}</td>
                    <td className="py-3 px-4">{day.fuelUsed.toFixed(1)} gal</td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${
                        day.mpg >= 7 ? 'text-green-600' : 
                        day.mpg >= 5 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {day.mpg.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4">{Math.round(day.idleTime)} min</td>
                    <td className="py-3 px-4">
                      <span className={`font-medium ${
                        day.idlePercent <= 15 ? 'text-green-600' : 
                        day.idlePercent <= 25 ? 'text-orange-600' : 'text-red-600'
                      }`}>
                        {day.idlePercent.toFixed(1)}%
                      </span>
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
