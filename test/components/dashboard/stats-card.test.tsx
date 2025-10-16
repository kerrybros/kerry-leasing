/**
 * Tests for dashboard stats cards
 */

import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils/test-utils'
import { FleetOverviewCard, MaintenanceCard, DashboardCard } from '@/components/dashboard/stats-card'

describe('FleetOverviewCard', () => {
  const defaultProps = {
    totalVehicles: 10,
    activeVehicles: 8,
    maintenanceVehicles: 2,
    upcomingMaintenance: 3,
    primaryColor: '#2563eb',
  }

  it('renders fleet statistics correctly', () => {
    renderWithProviders(<FleetOverviewCard {...defaultProps} />)

    expect(screen.getByText('Fleet Overview')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument() // total vehicles
    expect(screen.getByText('8')).toBeInTheDocument() // active vehicles
    expect(screen.getByText('2')).toBeInTheDocument() // maintenance vehicles
    expect(screen.getByText('3')).toBeInTheDocument() // upcoming maintenance
  })

  it('displays correct labels', () => {
    renderWithProviders(<FleetOverviewCard {...defaultProps} />)

    expect(screen.getByText('Total Vehicles')).toBeInTheDocument()
    expect(screen.getByText('Active Vehicles')).toBeInTheDocument()
    expect(screen.getByText('In Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Maintenance Due')).toBeInTheDocument()
  })

  it('applies correct styling for different vehicle states', () => {
    renderWithProviders(<FleetOverviewCard {...defaultProps} />)

    // Check for color classes (these might be applied via CSS-in-JS or Tailwind)
    const activeCount = screen.getByText('8')
    const maintenanceCount = screen.getByText('2')
    const upcomingCount = screen.getByText('3')

    expect(activeCount).toHaveClass('text-green-600')
    expect(maintenanceCount).toHaveClass('text-orange-600')
    expect(upcomingCount).toHaveClass('text-red-600')
  })

  it('handles zero values correctly', () => {
    const zeroProps = {
      ...defaultProps,
      totalVehicles: 0,
      activeVehicles: 0,
      maintenanceVehicles: 0,
      upcomingMaintenance: 0,
    }

    renderWithProviders(<FleetOverviewCard {...zeroProps} />)

    expect(screen.getAllByText('0')).toHaveLength(4)
  })
})

describe('MaintenanceCard', () => {
  const defaultProps = {
    onServiceRequest: vi.fn(),
    primaryColor: '#2563eb',
    serviceRequestEnabled: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders maintenance card with service request button', () => {
    renderWithProviders(<MaintenanceCard {...defaultProps} />)

    expect(screen.getByText('Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Manage vehicle maintenance and service requests')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request Service' })).toBeInTheDocument()
  })

  it('calls onServiceRequest when button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MaintenanceCard {...defaultProps} />)

    const button = screen.getByRole('button', { name: 'Request Service' })
    await user.click(button)

    expect(defaultProps.onServiceRequest).toHaveBeenCalledTimes(1)
  })

  it('hides service request button when disabled', () => {
    const disabledProps = {
      ...defaultProps,
      serviceRequestEnabled: false,
    }

    renderWithProviders(<MaintenanceCard {...disabledProps} />)

    expect(screen.queryByRole('button', { name: 'Request Service' })).not.toBeInTheDocument()
  })

  it('applies primary color to button', () => {
    renderWithProviders(<MaintenanceCard {...defaultProps} />)

    const button = screen.getByRole('button', { name: 'Request Service' })
    expect(button).toHaveStyle({ backgroundColor: '#2563eb' })
  })
})

describe('DashboardCard', () => {
  const defaultProps = {
    onViewDashboard: vi.fn(),
    primaryColor: '#2563eb',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard card correctly', () => {
    renderWithProviders(<DashboardCard {...defaultProps} />)

    expect(screen.getByText('Fleet Dashboard')).toBeInTheDocument()
    expect(screen.getByText('View detailed fleet analytics and performance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Dashboard' })).toBeInTheDocument()
  })

  it('calls onViewDashboard when button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DashboardCard {...defaultProps} />)

    const button = screen.getByRole('button', { name: 'View Dashboard' })
    await user.click(button)

    expect(defaultProps.onViewDashboard).toHaveBeenCalledTimes(1)
  })

  it('applies primary color styling to button', () => {
    renderWithProviders(<DashboardCard {...defaultProps} />)

    const button = screen.getByRole('button', { name: 'View Dashboard' })
    expect(button).toHaveStyle({ 
      borderColor: '#2563eb',
      color: '#2563eb'
    })
  })

  it('has correct button variant styling', () => {
    renderWithProviders(<DashboardCard {...defaultProps} />)

    const button = screen.getByRole('button', { name: 'View Dashboard' })
    expect(button).toHaveClass('hover:bg-blue-50')
  })
})

describe('StatCard base component behavior', () => {
  it('applies hover effects', () => {
    renderWithProviders(
      <FleetOverviewCard
        totalVehicles={5}
        activeVehicles={4}
        maintenanceVehicles={1}
        upcomingMaintenance={0}
        primaryColor="#2563eb"
      />
    )

    // The card should have hover transition classes
    const card = screen.getByText('Fleet Overview').closest('.hover\\:shadow-lg')
    expect(card).toBeInTheDocument()
  })

  it('displays icons correctly', () => {
    renderWithProviders(
      <FleetOverviewCard
        totalVehicles={5}
        activeVehicles={4}
        maintenanceVehicles={1}
        upcomingMaintenance={0}
        primaryColor="#2563eb"
      />
    )

    // Check for SVG icon presence
    const icon = screen.getByText('Fleet Overview').parentElement?.querySelector('svg')
    expect(icon).toBeInTheDocument()
  })
})
