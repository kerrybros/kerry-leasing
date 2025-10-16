import { ErrorType, ErrorSeverity, ErrorRecoveryStrategy, AppError } from './error-types'
import { nanoid } from 'nanoid'

/**
 * Classifies and enriches errors with metadata for better handling
 */
export class ErrorClassifier {
  private static getUserId(): string | undefined {
    // In a real app, get from auth context
    return typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined
  }

  private static getSessionId(): string {
    // In a real app, get from session management
    return typeof window !== 'undefined' 
      ? sessionStorage.getItem('sessionId') || nanoid()
      : nanoid()
  }

  /**
   * Classifies an error and returns enriched AppError
   */
  static classify(error: Error | unknown, context?: Record<string, any>): AppError {
    const errorString = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    // Network & API Error Classification
    if (this.isNetworkError(error)) {
      return this.createAppError({
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network connection failed',
        userMessage: 'Unable to connect to the server. Please check your internet connection.',
        recoveryStrategy: ErrorRecoveryStrategy.RETRY,
        maxRetries: 3,
        originalError: error instanceof Error ? error : undefined,
        context,
        stack
      })
    }

    if (this.isTimeoutError(error)) {
      return this.createAppError({
        type: ErrorType.TIMEOUT_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'Request timeout',
        userMessage: 'The request is taking longer than expected. Please try again.',
        recoveryStrategy: ErrorRecoveryStrategy.RETRY,
        maxRetries: 2,
        originalError: error instanceof Error ? error : undefined,
        context,
        stack
      })
    }

    if (this.isAPIError(error)) {
      const status = this.extractStatusCode(error)
      return this.classifyAPIError(error, status, context)
    }

    // Validation Errors
    if (this.isValidationError(error)) {
      return this.createAppError({
        type: ErrorType.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        message: 'Data validation failed',
        userMessage: 'Please check your input and try again.',
        recoveryStrategy: ErrorRecoveryStrategy.MANUAL_RETRY,
        originalError: error instanceof Error ? error : undefined,
        context,
        stack
      })
    }

    // Authentication Errors
    if (this.isAuthError(error)) {
      return this.createAppError({
        type: ErrorType.AUTH_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Authentication failed',
        userMessage: 'Please sign in again to continue.',
        recoveryStrategy: ErrorRecoveryStrategy.LOGOUT,
        originalError: error instanceof Error ? error : undefined,
        context,
        stack
      })
    }

    // Runtime Errors
    if (this.isRuntimeError(error)) {
      return this.createAppError({
        type: ErrorType.RUNTIME_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Application runtime error',
        userMessage: 'Something went wrong. Please refresh the page and try again.',
        recoveryStrategy: ErrorRecoveryStrategy.REFRESH,
        originalError: error instanceof Error ? error : undefined,
        context,
        stack
      })
    }

    // Default: Unknown Error
    return this.createAppError({
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: errorString,
      userMessage: 'An unexpected error occurred. Please try again.',
      recoveryStrategy: ErrorRecoveryStrategy.MANUAL_RETRY,
      originalError: error instanceof Error ? error : undefined,
      context,
      stack
    })
  }

  private static createAppError(params: Partial<AppError> & {
    type: ErrorType
    message: string
    userMessage: string
    recoveryStrategy: ErrorRecoveryStrategy
  }): AppError {
    return {
      id: nanoid(),
      timestamp: new Date(),
      userId: this.getUserId(),
      sessionId: this.getSessionId(),
      retryCount: 0,
      severity: ErrorSeverity.MEDIUM,
      maxRetries: 1,
      ...params
    }
  }

  private static classifyAPIError(error: unknown, status?: number, context?: Record<string, any>): AppError {
    const baseError = {
      originalError: error instanceof Error ? error : undefined,
      context,
      stack: error instanceof Error ? error.stack : undefined
    }

    switch (status) {
      case 400:
        return this.createAppError({
          ...baseError,
          type: ErrorType.VALIDATION_ERROR,
          severity: ErrorSeverity.LOW,
          message: 'Bad request',
          userMessage: 'Please check your input and try again.',
          recoveryStrategy: ErrorRecoveryStrategy.MANUAL_RETRY
        })

      case 401:
        return this.createAppError({
          ...baseError,
          type: ErrorType.AUTH_ERROR,
          severity: ErrorSeverity.HIGH,
          message: 'Unauthorized',
          userMessage: 'Please sign in again to continue.',
          recoveryStrategy: ErrorRecoveryStrategy.LOGOUT
        })

      case 403:
        return this.createAppError({
          ...baseError,
          type: ErrorType.PERMISSION_ERROR,
          severity: ErrorSeverity.HIGH,
          message: 'Access forbidden',
          userMessage: 'You don\'t have permission to access this resource.',
          recoveryStrategy: ErrorRecoveryStrategy.CONTACT_SUPPORT
        })

      case 404:
        return this.createAppError({
          ...baseError,
          type: ErrorType.API_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: 'Resource not found',
          userMessage: 'The requested information could not be found.',
          recoveryStrategy: ErrorRecoveryStrategy.FALLBACK
        })

      case 429:
        return this.createAppError({
          ...baseError,
          type: ErrorType.RATE_LIMIT_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: 'Rate limit exceeded',
          userMessage: 'Too many requests. Please wait a moment and try again.',
          recoveryStrategy: ErrorRecoveryStrategy.RETRY,
          maxRetries: 1
        })

      case 500:
      case 502:
      case 503:
      case 504:
        return this.createAppError({
          ...baseError,
          type: ErrorType.API_ERROR,
          severity: ErrorSeverity.HIGH,
          message: 'Server error',
          userMessage: 'The server is experiencing issues. Please try again later.',
          recoveryStrategy: ErrorRecoveryStrategy.RETRY,
          maxRetries: 2
        })

      default:
        return this.createAppError({
          ...baseError,
          type: ErrorType.API_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: `API error (${status})`,
          userMessage: 'A server error occurred. Please try again.',
          recoveryStrategy: ErrorRecoveryStrategy.RETRY,
          maxRetries: 1
        })
    }
  }

  // Error Detection Methods
  private static isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('fetch') || 
             error.message.includes('network') ||
             error.message.includes('Failed to fetch') ||
             error.name === 'NetworkError'
    }
    return false
  }

  private static isTimeoutError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('timeout') ||
             error.message.includes('aborted') ||
             error.name === 'TimeoutError'
    }
    return false
  }

  private static isAPIError(error: unknown): boolean {
    // Check if it's a fetch response error or has status code
    return this.extractStatusCode(error) !== undefined
  }

  private static isValidationError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('validation') ||
             error.message.includes('invalid') ||
             error.name === 'ValidationError' ||
             error.name === 'ZodError'
    }
    return false
  }

  private static isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('auth') ||
             error.message.includes('unauthorized') ||
             error.message.includes('token') ||
             error.name === 'AuthError'
    }
    return false
  }

  private static isRuntimeError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'TypeError' ||
             error.name === 'ReferenceError' ||
             error.name === 'RangeError' ||
             error.message.includes('undefined') ||
             error.message.includes('null')
    }
    return false
  }

  private static extractStatusCode(error: unknown): number | undefined {
    // Try to extract status code from various error formats
    if (error && typeof error === 'object') {
      const errorObj = error as any
      return errorObj.status || errorObj.statusCode || errorObj.response?.status
    }
    return undefined
  }
}
