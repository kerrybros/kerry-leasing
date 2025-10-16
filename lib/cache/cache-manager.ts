/**
 * Advanced caching system with multiple storage backends and intelligent invalidation
 */

import { nanoid } from 'nanoid'

export interface CacheEntry<T = any> {
  key: string
  value: T
  timestamp: number
  ttl: number // Time to live in milliseconds
  tags: string[]
  metadata?: Record<string, any>
}

export interface CacheConfig {
  defaultTTL: number // Default TTL in milliseconds
  maxSize: number // Maximum number of entries
  storageBackend: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB'
  compressionEnabled: boolean
  encryptionEnabled: boolean
  persistToDisk: boolean
}

export interface CacheStats {
  hits: number
  misses: number
  evictions: number
  totalEntries: number
  memoryUsage: number // Approximate memory usage in bytes
  hitRate: number
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000,
  storageBackend: 'memory',
  compressionEnabled: false,
  encryptionEnabled: false,
  persistToDisk: false,
}

class CacheManager {
  private config: CacheConfig
  private cache: Map<string, CacheEntry> = new Map()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalEntries: 0,
    memoryUsage: 0,
    hitRate: 0,
  }
  private cleanupInterval?: NodeJS.Timeout

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    // Start cleanup interval
    this.startCleanupInterval()
    
    // Load persisted cache if enabled
    if (this.config.persistToDisk) {
      this.loadPersistedCache()
    }
  }

  /**
   * Set a value in the cache
   */
  set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): void {
    const ttl = options.ttl || this.config.defaultTTL
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      tags: options.tags || [],
      metadata: options.metadata,
    }

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, entry)
    this.updateStats()

    // Persist to disk if enabled
    if (this.config.persistToDisk) {
      this.persistCache()
    }
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.stats.misses++
      this.updateHitRate()
      return null
    }

    // Update access time for LRU
    entry.timestamp = Date.now()
    this.stats.hits++
    this.updateHitRate()

    return entry.value as T
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    options: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const value = await factory()
    this.set(key, value, options)
    return value
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    if (this.isExpired(entry)) {
      this.cache.delete(key)
      return false
    }
    
    return true
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.updateStats()
    }
    return deleted
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.updateStats()
    
    if (this.config.persistToDisk) {
      this.clearPersistedCache()
    }
  }

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): number {
    let invalidated = 0
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key)
        invalidated++
      }
    }
    
    if (invalidated > 0) {
      this.updateStats()
    }
    
    return invalidated
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidateByPattern(pattern: RegExp): number {
    let invalidated = 0
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        invalidated++
      }
    }
    
    if (invalidated > 0) {
      this.updateStats()
    }
    
    return invalidated
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Get cache entries by tag
   */
  getByTag(tag: string): Array<{ key: string; value: any }> {
    const results: Array<{ key: string; value: any }> = []
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag) && !this.isExpired(entry)) {
        results.push({ key, value: entry.value })
      }
    }
    
    return results
  }

  /**
   * Warm up cache with multiple entries
   */
  async warmUp<T>(
    entries: Array<{
      key: string
      factory: () => Promise<T> | T
      options?: { ttl?: number; tags?: string[] }
    }>
  ): Promise<void> {
    const promises = entries.map(async ({ key, factory, options }) => {
      try {
        const value = await factory()
        this.set(key, value, options)
      } catch (error) {
        console.warn(`Failed to warm up cache for key "${key}":`, error)
      }
    })

    await Promise.allSettled(promises)
  }

  /**
   * Export cache data
   */
  export(): string {
    const exportData = {
      config: this.config,
      stats: this.stats,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        ...entry,
      })),
      timestamp: Date.now(),
    }

    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import cache data
   */
  import(data: string): void {
    try {
      const importData = JSON.parse(data)
      
      if (importData.entries && Array.isArray(importData.entries)) {
        this.cache.clear()
        
        importData.entries.forEach((entry: any) => {
          if (!this.isExpired(entry)) {
            this.cache.set(entry.key, entry)
          }
        })
        
        this.updateStats()
      }
    } catch (error) {
      console.error('Failed to import cache data:', error)
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Restart cleanup interval if TTL changed
    if (newConfig.defaultTTL) {
      this.stopCleanupInterval()
      this.startCleanupInterval()
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    let cleaned = 0
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      this.updateStats()
    }
    
    return cleaned
  }

  /**
   * Destroy the cache manager
   */
  destroy(): void {
    this.stopCleanupInterval()
    this.clear()
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl
  }

  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
    }
  }

  private updateStats(): void {
    this.stats.totalEntries = this.cache.size
    this.stats.memoryUsage = this.estimateMemoryUsage()
    this.updateHitRate()
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0
  }

  private estimateMemoryUsage(): number {
    let size = 0
    
    for (const entry of this.cache.values()) {
      // Rough estimation of memory usage
      size += JSON.stringify(entry).length * 2 // UTF-16 encoding
    }
    
    return size
  }

  private startCleanupInterval(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60 * 1000)
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
  }

  private loadPersistedCache(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem('cache_manager_data')
      if (stored) {
        this.import(stored)
      }
    } catch (error) {
      console.warn('Failed to load persisted cache:', error)
    }
  }

  private persistCache(): void {
    if (typeof window === 'undefined') return

    try {
      const data = this.export()
      localStorage.setItem('cache_manager_data', data)
    } catch (error) {
      console.warn('Failed to persist cache:', error)
    }
  }

  private clearPersistedCache(): void {
    if (typeof window === 'undefined') return

    try {
      localStorage.removeItem('cache_manager_data')
    } catch (error) {
      console.warn('Failed to clear persisted cache:', error)
    }
  }
}

// Global cache instances
export const appCache = new CacheManager({
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 500,
  persistToDisk: true,
})

export const apiCache = new CacheManager({
  defaultTTL: 2 * 60 * 1000, // 2 minutes
  maxSize: 200,
  persistToDisk: false,
})

export const userCache = new CacheManager({
  defaultTTL: 30 * 60 * 1000, // 30 minutes
  maxSize: 100,
  persistToDisk: true,
})

// React hook for cache management
export function useCache(cacheInstance: CacheManager = appCache) {
  return {
    get: cacheInstance.get.bind(cacheInstance),
    set: cacheInstance.set.bind(cacheInstance),
    getOrSet: cacheInstance.getOrSet.bind(cacheInstance),
    has: cacheInstance.has.bind(cacheInstance),
    delete: cacheInstance.delete.bind(cacheInstance),
    clear: cacheInstance.clear.bind(cacheInstance),
    invalidateByTags: cacheInstance.invalidateByTags.bind(cacheInstance),
    invalidateByPattern: cacheInstance.invalidateByPattern.bind(cacheInstance),
    getStats: cacheInstance.getStats.bind(cacheInstance),
  }
}
