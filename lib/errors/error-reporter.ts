import { AppError, ErrorSeverity } from './error-types'

/**
 * Centralized error reporting and logging system
 */
export class ErrorReporter {
  private static instance: ErrorReporter
  private errorQueue: AppError[] = []
  private isOnline = typeof window !== 'undefined' ? navigator.onLine : true
  private reportingEndpoint = '/api/errors' // In production, use your error reporting service

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter()
    }
    return ErrorReporter.instance
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      // Listen for online/offline events
      window.addEventListener('online', () => {
        this.isOnline = true
        this.flushErrorQueue()
      })
      
      window.addEventListener('offline', () => {
        this.isOnline = false
      })

      // Flush errors before page unload
      window.addEventListener('beforeunload', () => {
        this.flushErrorQueue(true) // Synchronous flush
      })
    }
  }

  /**
   * Reports an error with appropriate logging and external reporting
   */
  async report(error: AppError): Promise<void> {
    // Always log to console in development
    if (process.env.NODE_ENV === 'development') {
      this.logToConsole(error)
    }

    // Log to browser storage for offline analysis
    this.logToStorage(error)

    // Queue for external reporting
    this.errorQueue.push(error)

    // Attempt immediate reporting if online
    if (this.isOnline) {
      await this.flushErrorQueue()
    }
  }

  /**
   * Logs error to console with appropriate formatting
   */
  private logToConsole(error: AppError): void {
    const logLevel = this.getLogLevel(error.severity)
    const logMessage = this.formatConsoleMessage(error)

    switch (logLevel) {
      case 'error':
        console.error(logMessage, error)
        break
      case 'warn':
        console.warn(logMessage, error)
        break
      case 'info':
        console.info(logMessage, error)
        break
      default:
        console.log(logMessage, error)
    }

    // Log stack trace for runtime errors
    if (error.originalError?.stack) {
      console.error('Stack trace:', error.originalError.stack)
    }
  }

  /**
   * Stores error in browser storage for offline analysis
   */
  private logToStorage(error: AppError): void {
    try {
      const storageKey = 'app_errors'
      const existingErrors = this.getStoredErrors()
      
      // Keep only last 100 errors to prevent storage overflow
      const updatedErrors = [...existingErrors, error].slice(-100)
      
      localStorage.setItem(storageKey, JSON.stringify(updatedErrors))
    } catch (storageError) {
      console.warn('Failed to store error in localStorage:', storageError)
    }
  }

  /**
   * Gets stored errors from browser storage
   */
  getStoredErrors(): AppError[] {
    try {
      const stored = localStorage.getItem('app_errors')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  /**
   * Clears stored errors from browser storage
   */
  clearStoredErrors(): void {
    try {
      localStorage.removeItem('app_errors')
    } catch (error) {
      console.warn('Failed to clear stored errors:', error)
    }
  }

  /**
   * Flushes error queue to external reporting service
   */
  private async flushErrorQueue(synchronous = false): Promise<void> {
    if (this.errorQueue.length === 0) return

    const errorsToReport = [...this.errorQueue]
    this.errorQueue = []

    try {
      if (synchronous) {
        // Use sendBeacon for synchronous reporting during page unload
        this.sendBeacon(errorsToReport)
      } else {
        // Use fetch for normal async reporting
        await this.sendErrors(errorsToReport)
      }
    } catch (reportingError) {
      console.warn('Failed to report errors:', reportingError)
      // Re-queue errors for later retry
      this.errorQueue.unshift(...errorsToReport)
    }
  }

  /**
   * Sends errors via fetch API
   */
  private async sendErrors(errors: AppError[]): Promise<void> {
    // In production, replace with your actual error reporting service
    // Examples: Sentry, LogRocket, Bugsnag, etc.
    
    const payload = {
      errors: errors.map(this.sanitizeErrorForReporting),
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    }

    // For now, just log what would be sent
    if (process.env.NODE_ENV === 'development') {
      console.log('Would report errors to external service:', payload)
      return
    }

    // In production, send to your error reporting service
    const response = await fetch(this.reportingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Error reporting failed: ${response.status}`)
    }
  }

  /**
   * Sends errors via sendBeacon for page unload scenarios
   */
  private sendBeacon(errors: AppError[]): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      return
    }

    const payload = JSON.stringify({
      errors: errors.map(this.sanitizeErrorForReporting),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    })

    navigator.sendBeacon(this.reportingEndpoint, payload)
  }

  /**
   * Sanitizes error data for external reporting (removes sensitive info)
   */
  private sanitizeErrorForReporting(error: AppError): Partial<AppError> {
    const sanitized = { ...error }

    // Remove potentially sensitive context data
    if (sanitized.context) {
      const { password, token, apiKey, ...safeContext } = sanitized.context
      sanitized.context = safeContext
    }

    // Truncate very long messages
    if (sanitized.message && sanitized.message.length > 1000) {
      sanitized.message = sanitized.message.substring(0, 1000) + '...'
    }

    if (sanitized.technicalDetails && sanitized.technicalDetails.length > 2000) {
      sanitized.technicalDetails = sanitized.technicalDetails.substring(0, 2000) + '...'
    }

    return sanitized
  }

  /**
   * Formats error message for console logging
   */
  private formatConsoleMessage(error: AppError): string {
    return `[${error.severity}] ${error.type}: ${error.message} (ID: ${error.id})`
  }

  /**
   * Gets appropriate console log level for error severity
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error'
      case ErrorSeverity.MEDIUM:
        return 'warn'
      case ErrorSeverity.LOW:
        return 'info'
      default:
        return 'log'
    }
  }

  /**
   * Gets error statistics for monitoring
   */
  getErrorStats(): {
    total: number
    bySeverity: Record<ErrorSeverity, number>
    byType: Record<string, number>
    recent: AppError[]
  } {
    const storedErrors = this.getStoredErrors()
    const recentErrors = storedErrors.slice(-10)

    const bySeverity = storedErrors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1
      return acc
    }, {} as Record<ErrorSeverity, number>)

    const byType = storedErrors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      total: storedErrors.length,
      bySeverity,
      byType,
      recent: recentErrors
    }
  }
}

/**
 * Convenience function for reporting errors
 */
export const reportError = (error: AppError): Promise<void> => {
  return ErrorReporter.getInstance().report(error)
}

/**
 * Hook for accessing error reporting functionality
 */
export function useErrorReporting() {
  const reporter = ErrorReporter.getInstance()

  return {
    report: (error: AppError) => reporter.report(error),
    getStats: () => reporter.getErrorStats(),
    clearErrors: () => reporter.clearStoredErrors(),
    getStoredErrors: () => reporter.getStoredErrors()
  }
}
