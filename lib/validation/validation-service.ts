/**
 * Validation service that integrates with error handling system
 * Provides consistent validation across the application
 */

import { z } from 'zod'
import { ErrorClassifier } from '@/lib/errors/error-classifier'
import { reportError } from '@/lib/errors/error-reporter'
import { ErrorType } from '@/lib/errors/error-types'
import { validateData, validateApiResponse } from './schemas'

export class ValidationService {
  /**
   * Validates data and handles errors appropriately
   */
  static async validateWithErrorHandling<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    context: {
      operation: string
      source?: 'api' | 'form' | 'user_input' | 'internal'
      reportErrors?: boolean
    }
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    // Handle undefined/null data gracefully
    if (data === undefined || data === null) {
      return { 
        success: false, 
        error: `No data provided for ${context.operation}` 
      }
    }

    const result = validateData(schema, data, context.operation)
    
    if (!result.success) {
      // Create validation error
      const validationError = new Error(result.error)
      validationError.name = 'ValidationError'
      
      // Classify and potentially report the error
      const appError = ErrorClassifier.classify(validationError, {
        operation: context.operation,
        source: context.source || 'internal',
        validationDetails: result.details.errors,
        dataReceived: typeof data === 'object' ? JSON.stringify(data) : String(data)
      })
      
      // Report error if requested (usually for API validation failures)
      if (context.reportErrors !== false) {
        await reportError(appError)
      }
      
      return { success: false, error: appError.userMessage }
    }
    
    return result
  }

  /**
   * Validates API response with automatic error handling
   */
  static async validateApiResponseSafe<T>(
    dataSchema: z.ZodSchema<T>,
    response: unknown,
    context: {
      endpoint: string
      method?: string
    }
  ): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
      const data = validateApiResponse(dataSchema, response)
      return { success: true, data }
    } catch (error) {
      // Handle API validation errors
      const appError = ErrorClassifier.classify(error, {
        operation: 'api_response_validation',
        endpoint: context.endpoint,
        method: context.method || 'GET',
        responseReceived: typeof response === 'object' ? JSON.stringify(response) : String(response)
      })
      
      await reportError(appError)
      return { success: false, error: appError.userMessage }
    }
  }

  /**
   * Validates form data with user-friendly error messages
   */
  static validateForm<T>(
    schema: z.ZodSchema<T>,
    formData: unknown,
    fieldLabels?: Record<string, string>
  ): { success: true; data: T } | { success: false; errors: Record<string, string> } {
    const result = schema.safeParse(formData)
    
    if (result.success) {
      return { success: true, data: result.data }
    }
    
    // Convert Zod errors to field-specific error messages
    const errors: Record<string, string> = {}
    
    result.error.errors.forEach((error) => {
      const fieldPath = error.path.join('.')
      const fieldLabel = fieldLabels?.[fieldPath] || fieldPath
      
      // Customize error messages for better UX
      let message = error.message
      
      switch (error.code) {
        case 'too_small':
          if (error.type === 'string') {
            message = `${fieldLabel} must be at least ${error.minimum} characters`
          } else if (error.type === 'number') {
            message = `${fieldLabel} must be at least ${error.minimum}`
          }
          break
        case 'too_big':
          if (error.type === 'string') {
            message = `${fieldLabel} cannot exceed ${error.maximum} characters`
          } else if (error.type === 'number') {
            message = `${fieldLabel} cannot exceed ${error.maximum}`
          }
          break
        case 'invalid_type':
          message = `${fieldLabel} is required`
          break
        case 'invalid_string':
          if (error.validation === 'email') {
            message = `Please enter a valid email address`
          } else if (error.validation === 'url') {
            message = `Please enter a valid URL`
          }
          break
      }
      
      errors[fieldPath] = message
    })
    
    return { success: false, errors }
  }

  /**
   * Validates and sanitizes user input
   */
  static sanitizeInput<T>(
    schema: z.ZodSchema<T>,
    input: unknown,
    options: {
      trimStrings?: boolean
      removeEmptyStrings?: boolean
      convertEmptyToNull?: boolean
    } = {}
  ): T {
    let processedInput = input
    
    // Apply sanitization options
    if (typeof processedInput === 'object' && processedInput !== null) {
      processedInput = this.sanitizeObject(processedInput as Record<string, any>, options)
    }
    
    return schema.parse(processedInput)
  }

  private static sanitizeObject(
    obj: Record<string, any>,
    options: {
      trimStrings?: boolean
      removeEmptyStrings?: boolean
      convertEmptyToNull?: boolean
    }
  ): Record<string, any> {
    const sanitized: Record<string, any> = {}
    
    for (const [key, value] of Object.entries(obj)) {
      let processedValue = value
      
      if (typeof value === 'string') {
        // Trim strings if requested
        if (options.trimStrings !== false) {
          processedValue = value.trim()
        }
        
        // Handle empty strings
        if (processedValue === '') {
          if (options.removeEmptyStrings) {
            continue // Skip this field
          } else if (options.convertEmptyToNull) {
            processedValue = null
          }
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively sanitize nested objects
        processedValue = this.sanitizeObject(value, options)
      }
      
      sanitized[key] = processedValue
    }
    
    return sanitized
  }

  /**
   * Creates a validation middleware for API routes
   */
  static createValidationMiddleware<T>(
    schema: z.ZodSchema<T>,
    options: {
      source: 'body' | 'query' | 'params'
      onError?: (error: z.ZodError) => Response
    } = { source: 'body' }
  ) {
    return async (request: Request): Promise<{ success: true; data: T } | { success: false; response: Response }> => {
      try {
        let data: unknown
        
        switch (options.source) {
          case 'body':
            data = await request.json()
            break
          case 'query':
            const url = new URL(request.url)
            data = Object.fromEntries(url.searchParams.entries())
            break
          case 'params':
            // This would need to be handled by the route handler
            throw new Error('Params validation not supported in middleware')
          default:
            throw new Error(`Unsupported validation source: ${options.source}`)
        }
        
        const validatedData = schema.parse(data)
        return { success: true, data: validatedData }
        
      } catch (error) {
        if (error instanceof z.ZodError) {
          const response = options.onError?.(error) || new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request data',
                details: error.errors
              }
            }),
            { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          )
          
          return { success: false, response }
        }
        
        // Handle other errors
        const response = new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error'
            }
          }),
          { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        )
        
        return { success: false, response }
      }
    }
  }
}

/**
 * React hook for form validation
 */
export function useFormValidation<T>(
  schema: z.ZodSchema<T>,
  fieldLabels?: Record<string, string>
) {
  const validate = (formData: unknown) => {
    return ValidationService.validateForm(schema, formData, fieldLabels)
  }

  const validateField = (fieldName: string, value: unknown) => {
    // Create a partial schema for single field validation
    const fieldSchema = schema.shape?.[fieldName as keyof typeof schema.shape]
    if (!fieldSchema) {
      return { success: true, data: value }
    }

    const result = fieldSchema.safeParse(value)
    if (result.success) {
      return { success: true, data: result.data }
    }

    const fieldLabel = fieldLabels?.[fieldName] || fieldName
    const error = result.error.errors[0]
    let message = error.message

    // Customize error message
    switch (error.code) {
      case 'too_small':
        if (error.type === 'string') {
          message = `${fieldLabel} must be at least ${error.minimum} characters`
        }
        break
      case 'invalid_type':
        message = `${fieldLabel} is required`
        break
      case 'invalid_string':
        if (error.validation === 'email') {
          message = `Please enter a valid email address`
        }
        break
    }

    return { success: false, error: message }
  }

  return { validate, validateField }
}
