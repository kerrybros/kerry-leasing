'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorClassifier } from '@/lib/errors/error-classifier'
import { ErrorRecoveryManager, useErrorRecovery } from '@/lib/errors/error-recovery'
import { reportError } from '@/lib/errors/error-reporter'
import { AppError, ErrorSeverity } from '@/lib/errors/error-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AdvancedErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: AppError, actions: ReturnType<typeof useErrorRecovery>) => ReactNode
  featureName?: string
  onError?: (error: AppError) => void
  level?: 'page' | 'section' | 'component'
}

interface AdvancedErrorBoundaryState {
  hasError: boolean
  appError: AppError | null
  retryCount: number
}

export class AdvancedErrorBoundary extends Component<AdvancedErrorBoundaryProps, AdvancedErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null

  public state: AdvancedErrorBoundaryState = {
    hasError: false,
    appError: null,
    retryCount: 0
  }

  public static getDerivedStateFromError(error: Error): Partial<AdvancedErrorBoundaryState> {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const context = {
      componentStack: errorInfo.componentStack,
      featureName: this.props.featureName,
      level: this.props.level || 'component',
      props: this.props.children ? 'present' : 'none'
    }

    // Classify the error
    const appError = ErrorClassifier.classify(error, context)
    
    // Update state with classified error
    this.setState({ appError })

    // Report the error
    reportError(appError)

    // Call custom error handler if provided
    this.props.onError?.(appError)

    // Attempt automatic recovery for certain error types
    this.attemptAutoRecovery(appError)
  }

  private attemptAutoRecovery = async (error: AppError) => {
    if (error.recoveryStrategy === 'RETRY' && ErrorRecoveryManager.canRetry(error)) {
      const success = await ErrorRecoveryManager.executeAutoRetry(
        error,
        () => this.handleRetry(),
        (retryCount, maxRetries) => {
          console.log(`Auto-retry ${retryCount}/${maxRetries} for error: ${error.message}`)
        }
      )

      if (success) {
        this.setState({ hasError: false, appError: null, retryCount: 0 })
      }
    }
  }

  private handleRetry = async () => {
    // Clear error state to re-render children
    this.setState({ 
      hasError: false, 
      appError: null, 
      retryCount: this.state.retryCount + 1 
    })
  }

  private handleRefresh = () => {
    window.location.reload()
  }

  private handleLogout = () => {
    // In a real app, this would call your auth logout function
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/sign-in'
  }

  private handleContactSupport = () => {
    const error = this.state.appError
    if (!error) return

    const subject = `Error Report: ${error.type}`
    const body = `
Error ID: ${error.id}
Time: ${error.timestamp.toISOString()}
Feature: ${this.props.featureName || 'Unknown'}
Message: ${error.userMessage}

Technical Details:
${error.technicalDetails || error.message}
    `.trim()

    const email = 'support@kerrybrothers.com'
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  public render() {
    if (this.state.hasError && this.state.appError) {
      const error = this.state.appError

      // Use custom fallback if provided
      if (this.props.fallback) {
        const recoveryActions = {
          createRecoveryActions: (context: any) => ErrorRecoveryManager.getRecoveryActions(error, context),
          executeRetry: this.handleRetry,
          canRetry: () => ErrorRecoveryManager.canRetry(error),
          shouldShow: () => ErrorRecoveryManager.shouldShowToUser(error),
          getDisplayConfig: () => ErrorRecoveryManager.getDisplayConfig(error)
        }
        return this.props.fallback(error, recoveryActions)
      }

      // Default error UI
      return <DefaultErrorDisplay 
        error={error}
        featureName={this.props.featureName}
        onRetry={this.handleRetry}
        onRefresh={this.handleRefresh}
        onLogout={this.handleLogout}
        onContactSupport={this.handleContactSupport}
      />
    }

    return this.props.children
  }
}

interface DefaultErrorDisplayProps {
  error: AppError
  featureName?: string
  onRetry: () => void
  onRefresh: () => void
  onLogout: () => void
  onContactSupport: () => void
}

function DefaultErrorDisplay({ 
  error, 
  featureName, 
  onRetry, 
  onRefresh, 
  onLogout, 
  onContactSupport 
}: DefaultErrorDisplayProps) {
  const displayConfig = ErrorRecoveryManager.getDisplayConfig(error)
  const recoveryActions = ErrorRecoveryManager.getRecoveryActions(error, {
    onRetry,
    onRefresh,
    onLogout,
    onContactSupport
  })

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 'border-red-500 bg-red-50'
      case ErrorSeverity.HIGH: return 'border-orange-500 bg-orange-50'
      case ErrorSeverity.MEDIUM: return 'border-yellow-500 bg-yellow-50'
      case ErrorSeverity.LOW: return 'border-blue-500 bg-blue-50'
      default: return 'border-gray-500 bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return (
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case ErrorSeverity.MEDIUM:
        return (
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      default:
        return (
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[200px] p-4">
      <Card className={`max-w-md w-full ${getSeverityColor(error.severity)}`}>
        <CardHeader>
          <div className="flex items-center space-x-3">
            {getSeverityIcon(error.severity)}
            <div>
              <CardTitle className="text-lg">
                {featureName ? `${featureName} Error` : 'Something went wrong'}
              </CardTitle>
              <CardDescription className="text-sm text-gray-600">
                Error ID: {error.id}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-700">{error.userMessage}</p>
          
          {displayConfig.showTechnicalDetails && error.technicalDetails && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                Technical Details
              </summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                {error.technicalDetails}
              </pre>
            </details>
          )}

          {recoveryActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recoveryActions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.primary ? 'default' : 'outline'}
                  size="sm"
                  onClick={action.action}
                  className="flex-1 min-w-[100px]"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-500 border-t pt-2">
            <p>Time: {error.timestamp.toLocaleString()}</p>
            <p>Type: {error.type}</p>
            {ErrorRecoveryManager.canRetry(error) && (
              <p>{ErrorRecoveryManager.getRetryMessage(error)}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Feature-specific error boundaries using the advanced system
export const PortalAdvancedErrorBoundary = (props: Omit<AdvancedErrorBoundaryProps, 'featureName' | 'level'>) => (
  <AdvancedErrorBoundary featureName="Portal" level="page" {...props} />
)

export const DashboardAdvancedErrorBoundary = (props: Omit<AdvancedErrorBoundaryProps, 'featureName' | 'level'>) => (
  <AdvancedErrorBoundary featureName="Dashboard" level="page" {...props} />
)

export const ComponentErrorBoundary = (props: Omit<AdvancedErrorBoundaryProps, 'level'>) => (
  <AdvancedErrorBoundary level="component" {...props} />
)
