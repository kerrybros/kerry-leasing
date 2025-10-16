import { AppError, ErrorRecoveryStrategy, ErrorRecoveryAction } from './error-types'

/**
 * Handles error recovery strategies and provides recovery actions
 */
export class ErrorRecoveryManager {
  private static retryDelays = [1000, 2000, 4000, 8000] // Exponential backoff

  /**
   * Gets available recovery actions for an error
   */
  static getRecoveryActions(
    error: AppError, 
    context: {
      onRetry?: () => Promise<void>
      onRefresh?: () => void
      onLogout?: () => void
      onContactSupport?: () => void
      onFallback?: () => void
    }
  ): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = []

    switch (error.recoveryStrategy) {
      case ErrorRecoveryStrategy.RETRY:
        if (context.onRetry && this.canRetry(error)) {
          actions.push({
            label: 'Try Again',
            action: context.onRetry,
            primary: true
          })
        }
        break

      case ErrorRecoveryStrategy.MANUAL_RETRY:
        if (context.onRetry) {
          actions.push({
            label: 'Retry',
            action: context.onRetry,
            primary: true
          })
        }
        break

      case ErrorRecoveryStrategy.REFRESH:
        actions.push({
          label: 'Refresh Page',
          action: context.onRefresh || (() => window.location.reload()),
          primary: true
        })
        break

      case ErrorRecoveryStrategy.LOGOUT:
        if (context.onLogout) {
          actions.push({
            label: 'Sign In Again',
            action: context.onLogout,
            primary: true
          })
        }
        break

      case ErrorRecoveryStrategy.CONTACT_SUPPORT:
        actions.push({
          label: 'Contact Support',
          action: context.onContactSupport || this.defaultContactSupport,
          primary: true
        })
        break

      case ErrorRecoveryStrategy.FALLBACK:
        if (context.onFallback) {
          actions.push({
            label: 'Continue',
            action: context.onFallback,
            primary: true
          })
        }
        break

      case ErrorRecoveryStrategy.REDIRECT:
        actions.push({
          label: 'Go Back',
          action: () => window.history.back(),
          primary: true
        })
        break
    }

    // Always provide a dismiss option for non-critical errors
    if (error.severity !== 'CRITICAL') {
      actions.push({
        label: 'Dismiss',
        action: () => {}, // Will be handled by error display component
        primary: false
      })
    }

    return actions
  }

  /**
   * Executes automatic retry with exponential backoff
   */
  static async executeAutoRetry(
    error: AppError,
    retryFunction: () => Promise<void>,
    onRetryUpdate?: (retryCount: number, maxRetries: number) => void
  ): Promise<boolean> {
    if (!this.canRetry(error)) {
      return false
    }

    const retryCount = (error.retryCount || 0) + 1
    const maxRetries = error.maxRetries || 1
    const delay = this.retryDelays[Math.min(retryCount - 1, this.retryDelays.length - 1)]

    onRetryUpdate?.(retryCount, maxRetries)

    // Wait before retry
    await this.sleep(delay)

    try {
      await retryFunction()
      return true
    } catch (retryError) {
      // Update retry count
      error.retryCount = retryCount

      if (retryCount < maxRetries) {
        // Recursive retry
        return this.executeAutoRetry(error, retryFunction, onRetryUpdate)
      } else {
        // Max retries exceeded
        return false
      }
    }
  }

  /**
   * Checks if an error can be retried
   */
  static canRetry(error: AppError): boolean {
    const retryCount = error.retryCount || 0
    const maxRetries = error.maxRetries || 1
    
    return retryCount < maxRetries && 
           (error.recoveryStrategy === ErrorRecoveryStrategy.RETRY ||
            error.recoveryStrategy === ErrorRecoveryStrategy.MANUAL_RETRY)
  }

  /**
   * Gets user-friendly retry message
   */
  static getRetryMessage(error: AppError): string {
    const retryCount = error.retryCount || 0
    const maxRetries = error.maxRetries || 1
    const remaining = maxRetries - retryCount

    if (remaining > 1) {
      return `Retrying... (${remaining} attempts remaining)`
    } else if (remaining === 1) {
      return 'Retrying... (last attempt)'
    } else {
      return 'Maximum retry attempts reached'
    }
  }

  /**
   * Determines if error should be shown to user
   */
  static shouldShowToUser(error: AppError): boolean {
    return error.recoveryStrategy !== ErrorRecoveryStrategy.IGNORE &&
           error.severity !== 'LOW'
  }

  /**
   * Gets appropriate error display configuration
   */
  static getDisplayConfig(error: AppError) {
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    return {
      showTechnicalDetails: isDevelopment,
      showRetryButton: this.canRetry(error),
      showContactSupport: error.recoveryStrategy === ErrorRecoveryStrategy.CONTACT_SUPPORT,
      autoRetry: error.recoveryStrategy === ErrorRecoveryStrategy.RETRY,
      retryDelay: this.retryDelays[Math.min((error.retryCount || 0), this.retryDelays.length - 1)],
      maxRetries: error.maxRetries || 1
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private static defaultContactSupport = () => {
    // In a real app, this would open a support ticket or chat
    const email = 'support@kerrybrothers.com'
    const subject = 'Application Error Report'
    const body = 'I encountered an error while using the fleet management system.'
    
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }
}

/**
 * Error recovery hook for React components
 */
export function useErrorRecovery() {
  const createRecoveryActions = (
    error: AppError,
    context: {
      onRetry?: () => Promise<void>
      onRefresh?: () => void
      onLogout?: () => void
      onContactSupport?: () => void
      onFallback?: () => void
    }
  ) => {
    return ErrorRecoveryManager.getRecoveryActions(error, context)
  }

  const executeRetry = async (
    error: AppError,
    retryFunction: () => Promise<void>,
    onRetryUpdate?: (retryCount: number, maxRetries: number) => void
  ) => {
    return ErrorRecoveryManager.executeAutoRetry(error, retryFunction, onRetryUpdate)
  }

  const canRetry = (error: AppError) => {
    return ErrorRecoveryManager.canRetry(error)
  }

  const shouldShow = (error: AppError) => {
    return ErrorRecoveryManager.shouldShowToUser(error)
  }

  const getDisplayConfig = (error: AppError) => {
    return ErrorRecoveryManager.getDisplayConfig(error)
  }

  return {
    createRecoveryActions,
    executeRetry,
    canRetry,
    shouldShow,
    getDisplayConfig
  }
}
