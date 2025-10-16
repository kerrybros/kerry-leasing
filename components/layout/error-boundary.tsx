'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorState } from './error-state'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  featureName?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.featureName || 'App'} ErrorBoundary] Uncaught error:`, error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      
      const title = this.props.featureName ? `${this.props.featureName} Error` : 'Something went wrong'
      const message = process.env.NODE_ENV === 'development' 
        ? this.state.error?.message || 'An unexpected error occurred.'
        : 'We are working to fix the problem. Please try refreshing the page.'

      return (
        <ErrorState 
          title={title}
          message={message}
          showUserButton={false}
        />
      )
    }

    return this.props.children
  }
}

// Feature-specific Error Boundaries
export const PortalErrorBoundary = (props: Omit<ErrorBoundaryProps, 'featureName'>) => (
  <ErrorBoundary featureName="Portal" {...props} />
)

export const DashboardErrorBoundary = (props: Omit<ErrorBoundaryProps, 'featureName'>) => (
  <ErrorBoundary featureName="Dashboard" {...props} />
)

export const MaintenanceErrorBoundary = (props: Omit<ErrorBoundaryProps, 'featureName'>) => (
  <ErrorBoundary featureName="Maintenance" {...props} />
)
