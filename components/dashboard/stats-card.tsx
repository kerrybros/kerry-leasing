'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReactNode } from 'react'

interface StatsCardProps {
  title: string
  description?: string
  icon?: ReactNode
  primaryColor?: string
  children: ReactNode
  className?: string
}

export function StatsCard({ 
  title, 
  description, 
  icon, 
  primaryColor = '#2563eb', 
  children, 
  className = "hover:shadow-lg transition-shadow" 
}: StatsCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" style={{ color: primaryColor }}>
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  )
}

interface FleetOverviewCardProps {
  totalVehicles: number
  activeVehicles: number
  maintenanceVehicles: number
  upcomingMaintenance: number
  primaryColor?: string
}

export function FleetOverviewCard({ 
  totalVehicles, 
  activeVehicles, 
  maintenanceVehicles, 
  upcomingMaintenance,
  primaryColor = '#2563eb'
}: FleetOverviewCardProps) {
  const icon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )

  return (
    <StatsCard 
      title="Fleet Overview" 
      description="View your fleet statistics and performance"
      icon={icon}
      primaryColor={primaryColor}
    >
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-600">Total Vehicles</span>
          <span className="font-semibold">{totalVehicles}</span>
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
    </StatsCard>
  )
}

interface MaintenanceCardProps {
  onServiceRequest: () => void
  primaryColor?: string
  serviceRequestEnabled?: boolean
}

export function MaintenanceCard({ 
  onServiceRequest, 
  primaryColor = '#2563eb',
  serviceRequestEnabled = true
}: MaintenanceCardProps) {
  const icon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )

  return (
    <StatsCard 
      title="Maintenance" 
      icon={icon}
      primaryColor={primaryColor}
    >
      <div className="space-y-3">
        {serviceRequestEnabled && (
          <Button 
            className="w-full"
            style={{ backgroundColor: primaryColor }}
            onClick={onServiceRequest}
          >
            Request Service
          </Button>
        )}
      </div>
    </StatsCard>
  )
}

interface DashboardCardProps {
  onViewDashboard: () => void
  primaryColor?: string
}

export function DashboardCard({ 
  onViewDashboard, 
  primaryColor = '#2563eb' 
}: DashboardCardProps) {
  const icon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )

  return (
    <StatsCard 
      title="Fleet Dashboard" 
      description="View detailed fleet analytics and performance"
      icon={icon}
      primaryColor={primaryColor}
    >
      <Button 
        variant="outline" 
        className="w-full hover:bg-blue-50"
        style={{ borderColor: primaryColor, color: primaryColor }}
        onClick={onViewDashboard}
      >
        View Dashboard
      </Button>
    </StatsCard>
  )
}
