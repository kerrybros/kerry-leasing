/**
 * Render props patterns for flexible data sharing and UI composition
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { performanceMonitor } from '../performance/performance-monitor'

// ============================================================================
// DATA FETCHER RENDER PROP
// ============================================================================

interface DataFetcherProps<T> {
  url?: string
  fetcher?: () => Promise<T>
  dependencies?: any[]
  children: (state: {
    data: T | null
    loading: boolean
    error: string | null
    refetch: () => void
  }) => React.ReactNode
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  cacheKey?: string
  retryCount?: number
}

export function DataFetcher<T>({
  url,
  fetcher,
  dependencies = [],
  children,
  onSuccess,
  onError,
  cacheKey,
  retryCount = 3,
}: DataFetcherProps<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retries, setRetries] = useState(0)

  const fetchData = useCallback(async () => {
    if (!url && !fetcher) return

    setLoading(true)
    setError(null)

    try {
      let result: T

      if (fetcher) {
        result = await performanceMonitor.trackApiCall(
          cacheKey || 'custom_fetcher',
          'GET',
          fetcher
        )
      } else if (url) {
        result = await performanceMonitor.trackApiCall(
          url,
          'GET',
          async () => {
            const response = await fetch(url)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            return response.json()
          }
        )
      } else {
        throw new Error('Either url or fetcher must be provided')
      }

      setData(result)
      setRetries(0)
      onSuccess?.(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      
      if (retries < retryCount) {
        setRetries(prev => prev + 1)
        // Exponential backoff
        setTimeout(() => fetchData(), Math.pow(2, retries) * 1000)
        return
      }

      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setLoading(false)
    }
  }, [url, fetcher, cacheKey, retries, retryCount, onSuccess, onError])

  useEffect(() => {
    fetchData()
  }, [fetchData, ...dependencies])

  const refetch = useCallback(() => {
    setRetries(0)
    fetchData()
  }, [fetchData])

  return <>{children({ data, loading, error, refetch })}</>
}

// ============================================================================
// FORM STATE RENDER PROP
// ============================================================================

interface FormStateProps<T extends Record<string, any>> {
  initialValues: T
  validate?: (values: T) => Record<string, string>
  onSubmit?: (values: T) => Promise<void> | void
  children: (state: {
    values: T
    errors: Record<string, string>
    touched: Record<string, boolean>
    isSubmitting: boolean
    isValid: boolean
    setValue: (field: keyof T, value: any) => void
    setError: (field: keyof T, error: string) => void
    handleSubmit: (e?: React.FormEvent) => void
    reset: () => void
  }) => React.ReactNode
}

export function FormState<T extends Record<string, any>>({
  initialValues,
  validate,
  onSubmit,
  children,
}: FormStateProps<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setValue = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
    setTouched(prev => ({ ...prev, [field]: true }))
    
    // Clear error when user starts typing
    if (errors[field as string]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }, [errors])

  const setError = useCallback((field: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [field]: error }))
  }, [])

  const validateForm = useCallback(() => {
    if (!validate) return {}
    return validate(values)
  }, [validate, values])

  const isValid = useMemo(() => {
    const validationErrors = validateForm()
    return Object.keys(validationErrors).length === 0
  }, [validateForm])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!onSubmit) return

    const validationErrors = validateForm()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    
    try {
      await performanceMonitor.trackUserInteraction(
        'form_submit',
        0,
        async () => {
          await onSubmit(values)
        }
      )
    } catch (error) {
      console.error('Form submission error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [onSubmit, values, validateForm])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setIsSubmitting(false)
  }, [initialValues])

  return (
    <>
      {children({
        values,
        errors,
        touched,
        isSubmitting,
        isValid,
        setValue,
        setError,
        handleSubmit,
        reset,
      })}
    </>
  )
}

// ============================================================================
// INTERSECTION OBSERVER RENDER PROP
// ============================================================================

interface IntersectionObserverProps {
  threshold?: number | number[]
  rootMargin?: string
  triggerOnce?: boolean
  children: (state: {
    isIntersecting: boolean
    entry: IntersectionObserverEntry | null
    ref: React.RefCallback<Element>
  }) => React.ReactNode
}

export function IntersectionObserver({
  threshold = 0,
  rootMargin = '0px',
  triggerOnce = false,
  children,
}: IntersectionObserverProps) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null)
  const [element, setElement] = useState<Element | null>(null)

  const ref = useCallback((node: Element | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
        setEntry(entry)

        if (triggerOnce && entry.isIntersecting) {
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [element, threshold, rootMargin, triggerOnce])

  return <>{children({ isIntersecting, entry, ref })}</>
}

// ============================================================================
// RESIZE OBSERVER RENDER PROP
// ============================================================================

interface ResizeObserverProps {
  children: (state: {
    width: number
    height: number
    ref: React.RefCallback<Element>
  }) => React.ReactNode
}

export function ResizeObserver({ children }: ResizeObserverProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [element, setElement] = useState<Element | null>(null)

  const ref = useCallback((node: Element | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return

    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })
      }
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  return <>{children({ ...dimensions, ref })}</>
}

// ============================================================================
// MEDIA QUERY RENDER PROP
// ============================================================================

interface MediaQueryProps {
  query: string
  children: (matches: boolean) => React.ReactNode
}

export function MediaQuery({ query, children }: MediaQueryProps) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return <>{children(matches)}</>
}

// ============================================================================
// LOCAL STORAGE RENDER PROP
// ============================================================================

interface LocalStorageProps<T> {
  key: string
  defaultValue: T
  children: (state: {
    value: T
    setValue: (value: T) => void
    remove: () => void
  }) => React.ReactNode
}

export function LocalStorage<T>({ key, defaultValue, children }: LocalStorageProps<T>) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue

    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setStoredValue = useCallback((newValue: T) => {
    setValue(newValue)
    
    try {
      localStorage.setItem(key, JSON.stringify(newValue))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }, [key])

  const remove = useCallback(() => {
    setValue(defaultValue)
    
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('Failed to remove from localStorage:', error)
    }
  }, [key, defaultValue])

  return <>{children({ value, setValue: setStoredValue, remove })}</>
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Data Fetcher Usage:
<DataFetcher
  url="/api/fleet-data"
  cacheKey="fleet_data"
  onSuccess={(data) => console.log('Data loaded:', data)}
>
  {({ data, loading, error, refetch }) => (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {data && <FleetTable data={data} />}
      <button onClick={refetch}>Refresh</button>
    </div>
  )}
</DataFetcher>

// Form State Usage:
<FormState
  initialValues={{ email: '', password: '' }}
  validate={(values) => {
    const errors: any = {}
    if (!values.email) errors.email = 'Email is required'
    if (!values.password) errors.password = 'Password is required'
    return errors
  }}
  onSubmit={async (values) => {
    await login(values)
  }}
>
  {({ values, errors, setValue, handleSubmit, isSubmitting }) => (
    <form onSubmit={handleSubmit}>
      <input
        value={values.email}
        onChange={(e) => setValue('email', e.target.value)}
        placeholder="Email"
      />
      {errors.email && <span>{errors.email}</span>}
      
      <input
        type="password"
        value={values.password}
        onChange={(e) => setValue('password', e.target.value)}
        placeholder="Password"
      />
      {errors.password && <span>{errors.password}</span>}
      
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in...' : 'Login'}
      </button>
    </form>
  )}
</FormState>

// Intersection Observer Usage:
<IntersectionObserver threshold={0.5} triggerOnce>
  {({ isIntersecting, ref }) => (
    <div ref={ref}>
      {isIntersecting ? 'Visible!' : 'Not visible'}
    </div>
  )}
</IntersectionObserver>

// Media Query Usage:
<MediaQuery query="(min-width: 768px)">
  {(isDesktop) => (
    <div>
      {isDesktop ? <DesktopLayout /> : <MobileLayout />}
    </div>
  )}
</MediaQuery>

// Local Storage Usage:
<LocalStorage key="user-preferences" defaultValue={{ theme: 'light' }}>
  {({ value, setValue }) => (
    <div>
      <p>Current theme: {value.theme}</p>
      <button onClick={() => setValue({ theme: value.theme === 'light' ? 'dark' : 'light' })}>
        Toggle Theme
      </button>
    </div>
  )}
</LocalStorage>
*/
