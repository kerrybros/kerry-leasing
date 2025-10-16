/**
 * Comprehensive error classification system for production-grade error handling
 */

export enum ErrorType {
  // Network & API Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  
  // Data & Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SCHEMA_ERROR = 'SCHEMA_ERROR',
  DATA_CORRUPTION_ERROR = 'DATA_CORRUPTION_ERROR',
  
  // Authentication & Authorization
  AUTH_ERROR = 'AUTH_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  SESSION_EXPIRED_ERROR = 'SESSION_EXPIRED_ERROR',
  
  // Application Logic Errors
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  FEATURE_NOT_AVAILABLE_ERROR = 'FEATURE_NOT_AVAILABLE_ERROR',
  
  // System & Runtime Errors
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  BROWSER_COMPATIBILITY_ERROR = 'BROWSER_COMPATIBILITY_ERROR',
  
  // User Experience Errors
  USER_INPUT_ERROR = 'USER_INPUT_ERROR',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
  
  // Unknown/Fallback
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',           // Minor issues, app continues normally
  MEDIUM = 'MEDIUM',     // Some functionality affected
  HIGH = 'HIGH',         // Major functionality broken
  CRITICAL = 'CRITICAL'  // App unusable
}

export enum ErrorRecoveryStrategy {
  RETRY = 'RETRY',                    // Automatic retry
  MANUAL_RETRY = 'MANUAL_RETRY',      // User-initiated retry
  FALLBACK = 'FALLBACK',              // Use fallback data/UI
  REDIRECT = 'REDIRECT',              // Navigate to different page
  REFRESH = 'REFRESH',                // Full page refresh
  LOGOUT = 'LOGOUT',                  // Force logout and re-auth
  CONTACT_SUPPORT = 'CONTACT_SUPPORT', // Show support contact
  IGNORE = 'IGNORE'                   // Log but don't show to user
}

export interface AppError {
  id: string
  type: ErrorType
  severity: ErrorSeverity
  message: string
  userMessage: string
  technicalDetails?: string
  timestamp: Date
  userId?: string
  sessionId?: string
  context?: Record<string, any>
  recoveryStrategy: ErrorRecoveryStrategy
  retryCount?: number
  maxRetries?: number
  stack?: string
  originalError?: Error
}

export interface ErrorRecoveryAction {
  label: string
  action: () => void | Promise<void>
  primary?: boolean
}

export interface ErrorDisplayConfig {
  showTechnicalDetails: boolean
  showRetryButton: boolean
  showContactSupport: boolean
  autoRetry: boolean
  retryDelay: number
  maxRetries: number
}
