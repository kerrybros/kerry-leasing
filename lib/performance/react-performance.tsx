/**
 * React-specific performance monitoring utilities
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { performanceMonitor } from './performance-monitor'

/**
 * Higher-order component for tracking component render performance
 */
export function withPerformanceTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const PerformanceTrackedComponent = React.forwardRef<any, P>((props, ref) => {
    const renderStartTime = useRef<number>()
    const mountTime = useRef<number>()

    // Track mount time
    useEffect(() => {
      mountTime.current = performance.now()
      return () => {
        if (mountTime.current) {
          const unmountTime = performance.now()
          performanceMonitor.track(
            `lifecycle_${displayName}_mounted_duration`,
            unmountTime - mountTime.current,
            'render',
            'ms',
            { phase: 'mount_to_unmount' }
          )
        }
      }
    }, [])

    // Track render start
    renderStartTime.current = performance.now()

    // Track render completion
    useEffect(() => {
      if (renderStartTime.current) {
        const renderEndTime = performance.now()
        const renderDuration = renderEndTime - renderStartTime.current
        
        performanceMonitor.trackRender(displayName, renderDuration, {
          propsCount: Object.keys(props).length,
          hasRef: !!ref,
        })
      }
    })

    return <WrappedComponent {...props} ref={ref} />
  })

  PerformanceTrackedComponent.displayName = `withPerformanceTracking(${displayName})`
  
  return PerformanceTrackedComponent
}

/**
 * Hook for tracking component render performance
 */
export function useRenderPerformance(componentName: string, dependencies?: React.DependencyList) {
  const renderStartTime = useRef<number>()
  const renderCount = useRef(0)

  // Track render start
  renderStartTime.current = performance.now()
  renderCount.current++

  useEffect(() => {
    if (renderStartTime.current) {
      const renderEndTime = performance.now()
      const renderDuration = renderEndTime - renderStartTime.current
      
      performanceMonitor.trackRender(componentName, renderDuration, {
        renderCount: renderCount.current,
        dependenciesChanged: dependencies ? true : false,
      })
    }
  }, dependencies)

  return {
    renderCount: renderCount.current,
  }
}

/**
 * Hook for tracking user interactions
 */
export function useInteractionTracking() {
  const trackClick = useCallback((elementName: string, metadata?: Record<string, any>) => {
    performanceMonitor.trackUserInteraction('click', 0, {
      element: elementName,
      timestamp: Date.now(),
      ...metadata,
    })
  }, [])

  const trackFormSubmit = useCallback((formName: string, metadata?: Record<string, any>) => {
    performanceMonitor.trackUserInteraction('form_submit', 0, {
      form: formName,
      timestamp: Date.now(),
      ...metadata,
    })
  }, [])

  const trackNavigation = useCallback((from: string, to: string, duration?: number) => {
    performanceMonitor.trackUserInteraction('navigation', duration || 0, {
      from,
      to,
      timestamp: Date.now(),
    })
  }, [])

  const trackSearch = useCallback((query: string, resultsCount: number, duration: number) => {
    performanceMonitor.trackUserInteraction('search', duration, {
      query: query.length, // Don't store actual query for privacy
      resultsCount,
      timestamp: Date.now(),
    })
  }, [])

  return {
    trackClick,
    trackFormSubmit,
    trackNavigation,
    trackSearch,
  }
}

/**
 * Hook for tracking data loading performance
 */
export function useDataLoadingPerformance() {
  const trackDataLoad = useCallback(async <T,>(
    operationName: string,
    loadFunction: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> => {
    return performanceMonitor.trackDataProcessing(operationName, loadFunction, metadata)
  }, [])

  return { trackDataLoad }
}

/**
 * Component for displaying performance metrics in development
 */
export function PerformanceDevTools() {
  const [isOpen, setIsOpen] = useState(false)
  const [metrics, setMetrics] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        setMetrics(performanceMonitor.getMetrics({ limit: 50 }))
        setSummary(performanceMonitor.getSummary())
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [isOpen])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-blue-700 text-sm font-medium"
        >
          📊 Perf
        </button>
      ) : (
        <div className="bg-white border border-gray-300 rounded-lg shadow-xl w-96 max-h-96 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Performance Monitor</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="p-4 space-y-4 overflow-y-auto max-h-80">
            {summary && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-blue-50 p-2 rounded">
                  <div className="font-semibold text-blue-800">Total Metrics</div>
                  <div className="text-blue-600">{summary.totalMetrics}</div>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <div className="font-semibold text-green-800">Avg Duration</div>
                  <div className="text-green-600">{summary.averageValue.toFixed(1)}ms</div>
                </div>
                <div className="bg-yellow-50 p-2 rounded">
                  <div className="font-semibold text-yellow-800">P95</div>
                  <div className="text-yellow-600">{summary.p95Value.toFixed(1)}ms</div>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <div className="font-semibold text-red-800">Violations</div>
                  <div className="text-red-600">
                    {summary.thresholdViolations.warnings + summary.thresholdViolations.critical}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-semibold text-gray-700 text-sm">Recent Metrics</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {metrics.slice(0, 10).map((metric) => (
                  <div
                    key={metric.id}
                    className={`text-xs p-2 rounded ${
                      metric.value > 100 ? 'bg-red-50 text-red-700' :
                      metric.value > 50 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-green-50 text-green-700'
                    }`}
                  >
                    <div className="font-medium">{metric.name}</div>
                    <div className="flex justify-between">
                      <span>{metric.value.toFixed(1)}{metric.unit}</span>
                      <span className="text-gray-500">{metric.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  performanceMonitor.clearMetrics()
                  setMetrics([])
                  setSummary(null)
                }}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  const data = performanceMonitor.exportMetrics()
                  const blob = new Blob([data], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `performance-metrics-${Date.now()}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Performance boundary component that tracks error-related performance impacts
 */
interface PerformanceBoundaryProps {
  children: React.ReactNode
  componentName: string
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

interface PerformanceBoundaryState {
  hasError: boolean
  error: Error | null
  errorCount: number
}

export class PerformanceBoundary extends React.Component<
  PerformanceBoundaryProps,
  PerformanceBoundaryState
> {
  private errorStartTime: number = 0

  constructor(props: PerformanceBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorCount: 0 }
  }

  static getDerivedStateFromError(error: Error): PerformanceBoundaryState {
    return {
      hasError: true,
      error,
      errorCount: 0, // Will be updated in componentDidCatch
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorEndTime = performance.now()
    const errorDuration = this.errorStartTime ? errorEndTime - this.errorStartTime : 0

    // Track error performance impact
    performanceMonitor.track(
      `error_${this.props.componentName}`,
      errorDuration,
      'render',
      'ms',
      {
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        errorCount: this.state.errorCount + 1,
      }
    )

    this.setState(prevState => ({
      errorCount: prevState.errorCount + 1
    }))
  }

  componentDidUpdate(prevProps: PerformanceBoundaryProps, prevState: PerformanceBoundaryState) {
    // Track recovery time if error was resolved
    if (prevState.hasError && !this.state.hasError) {
      performanceMonitor.track(
        `recovery_${this.props.componentName}`,
        0,
        'render',
        'ms',
        {
          errorCount: prevState.errorCount,
          recoveryMethod: 'retry',
        }
      )
    }
  }

  render() {
    if (this.state.hasError) {
      this.errorStartTime = performance.now()

      const DefaultFallback = () => (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
          <h3 className="text-red-800 font-semibold">Something went wrong</h3>
          <p className="text-red-600 text-sm mt-1">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )

      const FallbackComponent = this.props.fallback || DefaultFallback

      return (
        <FallbackComponent
          error={this.state.error!}
          retry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}
