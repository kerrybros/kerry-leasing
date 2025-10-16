/**
 * Integration between React Query and our custom cache manager
 */

import { QueryClient, QueryKey, QueryFunction } from '@tanstack/react-query'
import { appCache, apiCache } from './cache-manager'
import { performanceMonitor } from '../performance/performance-monitor'

/**
 * Enhanced query client with custom caching
 */
export function createEnhancedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default stale time - data is fresh for 2 minutes
        staleTime: 2 * 60 * 1000,
        // Cache time - data stays in cache for 5 minutes after last use
        gcTime: 5 * 60 * 1000,
        // Retry configuration
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx errors (client errors)
          if (error?.status >= 400 && error?.status < 500) {
            return false
          }
          // Retry up to 3 times for other errors
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Network mode
        networkMode: 'online',
        // Refetch configuration
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: {
        retry: 1,
        networkMode: 'online',
      },
    },
  })
}

/**
 * Custom query function that integrates with our cache manager
 */
export function createCachedQueryFunction<T>(
  queryFn: QueryFunction<T>,
  options: {
    cacheKey?: string
    cacheTTL?: number
    tags?: string[]
    usePerformanceTracking?: boolean
  } = {}
): QueryFunction<T> {
  return async (context) => {
    const { queryKey, signal, meta } = context
    const cacheKey = options.cacheKey || `query_${JSON.stringify(queryKey)}`
    
    // Try to get from custom cache first
    const cached = apiCache.get<T>(cacheKey)
    if (cached !== null) {
      if (options.usePerformanceTracking) {
        performanceMonitor.track('cache_hit', 0, 'api', 'count', {
          queryKey: JSON.stringify(queryKey),
          cacheKey,
        })
      }
      return cached
    }

    // Execute the original query function with performance tracking
    const executeQuery = async () => {
      const result = await queryFn(context)
      
      // Store in custom cache
      apiCache.set(cacheKey, result, {
        ttl: options.cacheTTL,
        tags: options.tags || [`query_${queryKey[0]}`],
        metadata: {
          queryKey: JSON.stringify(queryKey),
          timestamp: Date.now(),
        },
      })
      
      return result
    }

    if (options.usePerformanceTracking) {
      return performanceMonitor.trackApiCall(
        `query_${queryKey[0]}`,
        'GET',
        executeQuery
      )
    }

    return executeQuery()
  }
}

/**
 * Cache invalidation utilities for React Query
 */
export class QueryCacheManager {
  constructor(private queryClient: QueryClient) {}

  /**
   * Invalidate queries by pattern
   */
  invalidateByPattern(pattern: RegExp): void {
    // Invalidate React Query cache
    this.queryClient.invalidateQueries({
      predicate: (query) => {
        const key = JSON.stringify(query.queryKey)
        return pattern.test(key)
      },
    })

    // Invalidate custom cache
    apiCache.invalidateByPattern(pattern)
  }

  /**
   * Invalidate queries by tags
   */
  invalidateByTags(tags: string[]): void {
    // Invalidate React Query cache by matching tags in meta
    this.queryClient.invalidateQueries({
      predicate: (query) => {
        const queryTags = query.meta?.tags as string[] || []
        return tags.some(tag => queryTags.includes(tag))
      },
    })

    // Invalidate custom cache
    apiCache.invalidateByTags(tags)
  }

  /**
   * Invalidate all fleet-related queries
   */
  invalidateFleetData(): void {
    this.invalidateByTags(['fleet', 'vehicles', 'maintenance'])
  }

  /**
   * Invalidate all customer-related queries
   */
  invalidateCustomerData(): void {
    this.invalidateByTags(['customer', 'config'])
  }

  /**
   * Invalidate all user-related queries
   */
  invalidateUserData(): void {
    this.invalidateByTags(['user', 'auth'])
  }

  /**
   * Prefetch and cache data
   */
  async prefetchAndCache<T>(
    queryKey: QueryKey,
    queryFn: () => Promise<T>,
    options: {
      staleTime?: number
      cacheTime?: number
      tags?: string[]
    } = {}
  ): Promise<void> {
    // Prefetch in React Query
    await this.queryClient.prefetchQuery({
      queryKey,
      queryFn,
      staleTime: options.staleTime,
      gcTime: options.cacheTime,
      meta: { tags: options.tags },
    })

    // Also cache in custom cache
    const cacheKey = `query_${JSON.stringify(queryKey)}`
    const data = await queryFn()
    
    apiCache.set(cacheKey, data, {
      ttl: options.staleTime || 2 * 60 * 1000,
      tags: options.tags || [],
    })
  }

  /**
   * Warm up cache with critical data
   */
  async warmUpCache(customerId: string): Promise<void> {
    const warmUpTasks = [
      {
        key: ['customer', customerId],
        factory: () => this.fetchCustomerConfig(customerId),
        options: { tags: ['customer', 'config'] },
      },
      {
        key: ['fleet', customerId],
        factory: () => this.fetchFleetData(customerId),
        options: { tags: ['fleet', 'vehicles'] },
      },
      {
        key: ['maintenance', customerId],
        factory: () => this.fetchMaintenanceData(customerId),
        options: { tags: ['maintenance'] },
      },
    ]

    await Promise.allSettled(
      warmUpTasks.map(task =>
        this.prefetchAndCache(task.key, task.factory, task.options)
      )
    )
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      reactQuery: {
        queries: this.queryClient.getQueryCache().getAll().length,
        mutations: this.queryClient.getMutationCache().getAll().length,
      },
      customCache: {
        api: apiCache.getStats(),
        app: appCache.getStats(),
      },
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.queryClient.clear()
    apiCache.clear()
    appCache.clear()
  }

  // Mock data fetchers (replace with actual API calls)
  private async fetchCustomerConfig(customerId: string) {
    // This would be replaced with actual API call
    return { id: customerId, name: 'Mock Customer' }
  }

  private async fetchFleetData(customerId: string) {
    // This would be replaced with actual API call
    return []
  }

  private async fetchMaintenanceData(customerId: string) {
    // This would be replaced with actual API call
    return []
  }
}

/**
 * React hook for query cache management
 */
export function useQueryCacheManager(queryClient: QueryClient) {
  const cacheManager = new QueryCacheManager(queryClient)

  return {
    invalidateByPattern: cacheManager.invalidateByPattern.bind(cacheManager),
    invalidateByTags: cacheManager.invalidateByTags.bind(cacheManager),
    invalidateFleetData: cacheManager.invalidateFleetData.bind(cacheManager),
    invalidateCustomerData: cacheManager.invalidateCustomerData.bind(cacheManager),
    invalidateUserData: cacheManager.invalidateUserData.bind(cacheManager),
    prefetchAndCache: cacheManager.prefetchAndCache.bind(cacheManager),
    warmUpCache: cacheManager.warmUpCache.bind(cacheManager),
    getCacheStats: cacheManager.getCacheStats.bind(cacheManager),
    clearAllCaches: cacheManager.clearAllCaches.bind(cacheManager),
  }
}

/**
 * Cache-aware data fetching hook
 */
export function useCachedQuery<T>(
  queryKey: QueryKey,
  queryFn: QueryFunction<T>,
  options: {
    staleTime?: number
    cacheTime?: number
    tags?: string[]
    useCustomCache?: boolean
    usePerformanceTracking?: boolean
  } = {}
) {
  const enhancedQueryFn = options.useCustomCache
    ? createCachedQueryFunction(queryFn, {
        tags: options.tags,
        usePerformanceTracking: options.usePerformanceTracking,
      })
    : queryFn

  return {
    queryKey,
    queryFn: enhancedQueryFn,
    staleTime: options.staleTime,
    gcTime: options.cacheTime,
    meta: { tags: options.tags },
  }
}
