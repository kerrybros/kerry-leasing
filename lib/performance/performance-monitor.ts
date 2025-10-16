/**
 * Performance monitoring system for tracking application performance
 */

import { nanoid } from 'nanoid'

export interface PerformanceMetric {
  id: string
  name: string
  value: number
  unit: 'ms' | 'bytes' | 'count' | 'percentage'
  timestamp: number
  category: 'render' | 'api' | 'user_interaction' | 'data_processing' | 'navigation'
  metadata?: Record<string, any>
}

export interface PerformanceThreshold {
  warning: number
  critical: number
}

export interface PerformanceConfig {
  enabled: boolean
  sampleRate: number // 0-1, percentage of operations to monitor
  thresholds: {
    apiCall: PerformanceThreshold
    componentRender: PerformanceThreshold
    dataProcessing: PerformanceThreshold
    userInteraction: PerformanceThreshold
  }
  maxMetricsInMemory: number
  reportingEndpoint?: string
}

const DEFAULT_CONFIG: PerformanceConfig = {
  enabled: process.env.NODE_ENV !== 'test',
  sampleRate: 1.0, // Monitor everything in development
  thresholds: {
    apiCall: { warning: 1000, critical: 3000 }, // ms
    componentRender: { warning: 16, critical: 50 }, // ms (60fps = 16ms per frame)
    dataProcessing: { warning: 100, critical: 500 }, // ms
    userInteraction: { warning: 100, critical: 300 }, // ms
  },
  maxMetricsInMemory: 1000,
}

class PerformanceMonitor {
  private config: PerformanceConfig
  private metrics: PerformanceMetric[] = []
  private observers: Map<string, PerformanceObserver> = new Map()

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    if (this.config.enabled && typeof window !== 'undefined') {
      this.initializeBrowserMonitoring()
    }
  }

  /**
   * Track a performance metric
   */
  track(
    name: string,
    value: number,
    category: PerformanceMetric['category'],
    unit: PerformanceMetric['unit'] = 'ms',
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enabled || !this.shouldSample()) {
      return
    }

    const metric: PerformanceMetric = {
      id: nanoid(),
      name,
      value,
      unit,
      timestamp: Date.now(),
      category,
      metadata,
    }

    this.addMetric(metric)
    this.checkThresholds(metric)
  }

  /**
   * Time an operation and track its duration
   */
  async timeOperation<T>(
    name: string,
    operation: () => Promise<T> | T,
    category: PerformanceMetric['category'],
    metadata?: Record<string, any>
  ): Promise<T> {
    if (!this.config.enabled || !this.shouldSample()) {
      return await operation()
    }

    const startTime = performance.now()
    
    try {
      const result = await operation()
      const duration = performance.now() - startTime
      
      this.track(name, duration, category, 'ms', {
        ...metadata,
        success: true,
      })
      
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      this.track(name, duration, category, 'ms', {
        ...metadata,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      
      throw error
    }
  }

  /**
   * Track API call performance
   */
  async trackApiCall<T>(
    endpoint: string,
    method: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.timeOperation(
      `api_${method.toLowerCase()}_${endpoint}`,
      operation,
      'api',
      { endpoint, method }
    )
  }

  /**
   * Track component render performance
   */
  trackRender(componentName: string, renderTime: number, metadata?: Record<string, any>): void {
    this.track(
      `render_${componentName}`,
      renderTime,
      'render',
      'ms',
      metadata
    )
  }

  /**
   * Track user interaction performance
   */
  trackUserInteraction(
    interactionType: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    this.track(
      `interaction_${interactionType}`,
      duration,
      'user_interaction',
      'ms',
      metadata
    )
  }

  /**
   * Track data processing performance
   */
  async trackDataProcessing<T>(
    operationName: string,
    operation: () => Promise<T> | T,
    metadata?: Record<string, any>
  ): Promise<T> {
    return this.timeOperation(
      `data_${operationName}`,
      operation,
      'data_processing',
      metadata
    )
  }

  /**
   * Get performance metrics
   */
  getMetrics(filters?: {
    category?: PerformanceMetric['category']
    name?: string
    since?: number // timestamp
    limit?: number
  }): PerformanceMetric[] {
    let filtered = [...this.metrics]

    if (filters?.category) {
      filtered = filtered.filter(m => m.category === filters.category)
    }

    if (filters?.name) {
      filtered = filtered.filter(m => m.name.includes(filters.name!))
    }

    if (filters?.since) {
      filtered = filtered.filter(m => m.timestamp >= filters.since!)
    }

    if (filters?.limit) {
      filtered = filtered.slice(-filters.limit)
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get performance summary statistics
   */
  getSummary(category?: PerformanceMetric['category']): {
    totalMetrics: number
    averageValue: number
    minValue: number
    maxValue: number
    p95Value: number
    thresholdViolations: {
      warnings: number
      critical: number
    }
  } {
    const metrics = category 
      ? this.metrics.filter(m => m.category === category)
      : this.metrics

    if (metrics.length === 0) {
      return {
        totalMetrics: 0,
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
        p95Value: 0,
        thresholdViolations: { warnings: 0, critical: 0 }
      }
    }

    const values = metrics.map(m => m.value).sort((a, b) => a - b)
    const p95Index = Math.floor(values.length * 0.95)

    // Count threshold violations
    let warnings = 0
    let critical = 0

    metrics.forEach(metric => {
      const threshold = this.getThresholdForCategory(metric.category)
      if (threshold) {
        if (metric.value >= threshold.critical) {
          critical++
        } else if (metric.value >= threshold.warning) {
          warnings++
        }
      }
    })

    return {
      totalMetrics: metrics.length,
      averageValue: values.reduce((sum, val) => sum + val, 0) / values.length,
      minValue: values[0],
      maxValue: values[values.length - 1],
      p95Value: values[p95Index] || 0,
      thresholdViolations: { warnings, critical }
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = []
  }

  /**
   * Export metrics for external reporting
   */
  exportMetrics(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      config: this.config,
      metrics: this.metrics,
      summary: this.getSummary(),
    }, null, 2)
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate
  }

  private addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric)

    // Limit memory usage
    if (this.metrics.length > this.config.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.config.maxMetricsInMemory)
    }
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.getThresholdForCategory(metric.category)
    if (!threshold) return

    if (metric.value >= threshold.critical) {
      console.warn(`🚨 CRITICAL: ${metric.name} took ${metric.value}${metric.unit} (threshold: ${threshold.critical}${metric.unit})`, metric)
    } else if (metric.value >= threshold.warning) {
      console.warn(`⚠️ WARNING: ${metric.name} took ${metric.value}${metric.unit} (threshold: ${threshold.warning}${metric.unit})`, metric)
    }
  }

  private getThresholdForCategory(category: PerformanceMetric['category']): PerformanceThreshold | null {
    switch (category) {
      case 'api':
        return this.config.thresholds.apiCall
      case 'render':
        return this.config.thresholds.componentRender
      case 'data_processing':
        return this.config.thresholds.dataProcessing
      case 'user_interaction':
        return this.config.thresholds.userInteraction
      default:
        return null
    }
  }

  private initializeBrowserMonitoring(): void {
    if (!('PerformanceObserver' in window)) {
      console.warn('PerformanceObserver not supported, some metrics will be unavailable')
      return
    }

    // Monitor navigation timing
    this.observePerformanceEntries('navigation', (entries) => {
      entries.forEach((entry: any) => {
        this.track('page_load', entry.loadEventEnd - entry.loadEventStart, 'navigation', 'ms')
        this.track('dom_content_loaded', entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart, 'navigation', 'ms')
        this.track('first_paint', entry.responseEnd - entry.requestStart, 'navigation', 'ms')
      })
    })

    // Monitor resource loading
    this.observePerformanceEntries('resource', (entries) => {
      entries.forEach((entry: any) => {
        if (entry.name.includes('api') || entry.name.includes('fetch')) {
          this.track(`resource_${entry.name}`, entry.duration, 'api', 'ms', {
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
          })
        }
      })
    })

    // Monitor long tasks (blocking the main thread)
    this.observePerformanceEntries('longtask', (entries) => {
      entries.forEach((entry: any) => {
        this.track('long_task', entry.duration, 'render', 'ms', {
          startTime: entry.startTime,
        })
      })
    })
  }

  private observePerformanceEntries(
    entryType: string,
    callback: (entries: PerformanceEntry[]) => void
  ): void {
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries())
      })

      observer.observe({ entryTypes: [entryType] })
      this.observers.set(entryType, observer)
    } catch (error) {
      console.warn(`Failed to observe ${entryType} performance entries:`, error)
    }
  }

  /**
   * Cleanup observers
   */
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers.clear()
    this.metrics = []
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor()

// React hook for performance monitoring
export function usePerformanceMonitor() {
  return {
    track: performanceMonitor.track.bind(performanceMonitor),
    timeOperation: performanceMonitor.timeOperation.bind(performanceMonitor),
    trackApiCall: performanceMonitor.trackApiCall.bind(performanceMonitor),
    trackRender: performanceMonitor.trackRender.bind(performanceMonitor),
    trackUserInteraction: performanceMonitor.trackUserInteraction.bind(performanceMonitor),
    trackDataProcessing: performanceMonitor.trackDataProcessing.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    getSummary: performanceMonitor.getSummary.bind(performanceMonitor),
  }
}
