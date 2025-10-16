import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'

// Tailwind class merging utility (existing)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date utilities
export const dateUtils = {
  /**
   * Format a date for display
   */
  format: (date: Date | string | null | undefined, formatStr: string = 'MMM d, yyyy'): string => {
    if (!date) return 'N/A'
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    
    if (!isValid(dateObj)) return 'Invalid Date'
    
    return format(dateObj, formatStr)
  },

  /**
   * Format date as relative time (e.g., "2 hours ago")
   */
  relative: (date: Date | string | null | undefined): string => {
    if (!date) return 'N/A'
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    
    if (!isValid(dateObj)) return 'Invalid Date'
    
    return formatDistanceToNow(dateObj, { addSuffix: true })
  },

  /**
   * Check if a date is in the past
   */
  isPast: (date: Date | string | null | undefined): boolean => {
    if (!date) return false
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    
    if (!isValid(dateObj)) return false
    
    return dateObj < new Date()
  },

  /**
   * Check if a date is within the next N days
   */
  isWithinDays: (date: Date | string | null | undefined, days: number): boolean => {
    if (!date) return false
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date
    
    if (!isValid(dateObj)) return false
    
    const now = new Date()
    const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000))
    
    return dateObj >= now && dateObj <= futureDate
  }
}

// Number utilities
export const numberUtils = {
  /**
   * Format number as currency
   */
  currency: (value: number | null | undefined, currency: string = 'USD'): string => {
    if (value === null || value === undefined) return 'N/A'
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value)
  },

  /**
   * Format number with commas
   */
  withCommas: (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A'
    
    return new Intl.NumberFormat('en-US').format(value)
  },

  /**
   * Format as percentage
   */
  percentage: (value: number | null | undefined, decimals: number = 1): string => {
    if (value === null || value === undefined) return 'N/A'
    
    return `${value.toFixed(decimals)}%`
  },

  /**
   * Format mileage with K/M suffixes
   */
  mileage: (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A'
    
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M miles`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K miles`
    } else {
      return `${value} miles`
    }
  }
}

// String utilities
export const stringUtils = {
  /**
   * Truncate string with ellipsis
   */
  truncate: (str: string | null | undefined, length: number = 50): string => {
    if (!str) return ''
    
    if (str.length <= length) return str
    
    return str.slice(0, length) + '...'
  },

  /**
   * Capitalize first letter
   */
  capitalize: (str: string | null | undefined): string => {
    if (!str) return ''
    
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  },

  /**
   * Convert to title case
   */
  titleCase: (str: string | null | undefined): string => {
    if (!str) return ''
    
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
  },

  /**
   * Generate initials from name
   */
  initials: (name: string | null | undefined): string => {
    if (!name) return ''
    
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
}

// Array utilities
export const arrayUtils = {
  /**
   * Group array by key
   */
  groupBy: <T, K extends keyof T>(array: T[], key: K): Record<string, T[]> => {
    return array.reduce((groups, item) => {
      const groupKey = String(item[key])
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
      return groups
    }, {} as Record<string, T[]>)
  },

  /**
   * Sort array by multiple keys
   */
  sortBy: <T>(array: T[], ...keys: (keyof T)[]): T[] => {
    return [...array].sort((a, b) => {
      for (const key of keys) {
        const aVal = a[key]
        const bVal = b[key]
        
        if (aVal < bVal) return -1
        if (aVal > bVal) return 1
      }
      return 0
    })
  },

  /**
   * Remove duplicates by key
   */
  uniqueBy: <T, K extends keyof T>(array: T[], key: K): T[] => {
    const seen = new Set()
    return array.filter(item => {
      const keyValue = item[key]
      if (seen.has(keyValue)) {
        return false
      }
      seen.add(keyValue)
      return true
    })
  }
}

// Color utilities
export const colorUtils = {
  /**
   * Get status color classes
   */
  statusColor: (status: string): string => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      maintenance: 'bg-yellow-100 text-yellow-800',
      in_service: 'bg-orange-100 text-orange-800',
      out_of_service: 'bg-red-100 text-red-800',
      completed: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      scheduled: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-gray-100 text-gray-800',
      high: 'bg-red-100 text-red-800',
      medium: 'bg-orange-100 text-orange-800',
      low: 'bg-green-100 text-green-800',
    }
    
    return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-800'
  },

  /**
   * Get priority color
   */
  priorityColor: (priority: string): string => {
    const colors: Record<string, string> = {
      critical: 'text-red-600 bg-red-50 border-red-200',
      high: 'text-orange-600 bg-orange-50 border-orange-200',
      medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      low: 'text-green-600 bg-green-50 border-green-200',
    }
    
    return colors[priority.toLowerCase()] || 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

// Validation utilities
export const validationUtils = {
  /**
   * Check if email is valid
   */
  isEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  },

  /**
   * Check if phone number is valid (US format)
   */
  isPhone: (phone: string): boolean => {
    const phoneRegex = /^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/
    return phoneRegex.test(phone)
  },

  /**
   * Check if URL is valid
   */
  isUrl: (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }
}

// Local storage utilities
export const storageUtils = {
  /**
   * Safely get item from localStorage
   */
  get: <T>(key: string, defaultValue?: T): T | null => {
    if (typeof window === 'undefined') return defaultValue || null
    
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue || null
    } catch {
      return defaultValue || null
    }
  },

  /**
   * Safely set item in localStorage
   */
  set: (key: string, value: unknown): boolean => {
    if (typeof window === 'undefined') return false
    
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  /**
   * Remove item from localStorage
   */
  remove: (key: string): boolean => {
    if (typeof window === 'undefined') return false
    
    try {
      window.localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

// Throttle utility
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}