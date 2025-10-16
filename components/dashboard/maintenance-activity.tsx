'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MaintenanceRecord } from '@/lib/customer-data-service'

interface MaintenanceActivityProps {
  recentMaintenanceData: MaintenanceRecord[]
  totalMaintenanceCount: number
  className?: string
}

export function MaintenanceActivity({ 
  recentMaintenanceData, 
  totalMaintenanceCount,
  className = ""
}: MaintenanceActivityProps) {
  if (recentMaintenanceData.length === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Maintenance</CardTitle>
        <CardDescription>Latest maintenance activities and upcoming services</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentMaintenanceData.map((maintenance) => (
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
              {/* Cost display removed as per user requirements */}
            </div>
          ))}
          {totalMaintenanceCount > recentMaintenanceData.length && (
            <div className="text-center pt-4">
              <Button variant="outline">
                View All Maintenance Records
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface NoDataStateProps {
  className?: string
}

export function NoDataState({ className = "" }: NoDataStateProps) {
  return (
    <Card className={className}>
      <CardContent className="text-center py-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
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
  )
}
