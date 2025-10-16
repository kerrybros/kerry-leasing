/**
 * Screen reader utilities and components for accessibility
 */

import React, { useEffect, useState, useRef } from 'react'

// ============================================================================
// SCREEN READER ONLY TEXT
// ============================================================================

interface ScreenReaderOnlyProps {
  children: React.ReactNode
  as?: keyof JSX.IntrinsicElements
  className?: string
}

export function ScreenReaderOnly({ 
  children, 
  as: Component = 'span',
  className = ''
}: ScreenReaderOnlyProps) {
  return (
    <Component className={`sr-only ${className}`}>
      {children}
    </Component>
  )
}

// ============================================================================
// ANNOUNCER HOOK
// ============================================================================

export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('')
  const timeoutRef = useRef<NodeJS.Timeout>()

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set the announcement
    setAnnouncement(message)

    // Clear the announcement after a short delay to allow for re-announcements
    timeoutRef.current = setTimeout(() => {
      setAnnouncement('')
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const AnnouncerComponent = ({ priority = 'polite' }: { priority?: 'polite' | 'assertive' }) => (
    <div
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  )

  return { announce, AnnouncerComponent }
}

// ============================================================================
// PROGRESS ANNOUNCER
// ============================================================================

interface ProgressAnnouncerProps {
  value: number
  max?: number
  label?: string
  announceInterval?: number // Announce every N percent
  formatMessage?: (value: number, max: number, percentage: number) => string
}

export function ProgressAnnouncer({
  value,
  max = 100,
  label = 'Progress',
  announceInterval = 10,
  formatMessage = (value, max, percentage) => 
    `${label}: ${percentage}% complete. ${value} of ${max}.`
}: ProgressAnnouncerProps) {
  const [lastAnnounced, setLastAnnounced] = useState(-1)
  const { announce, AnnouncerComponent } = useAnnouncer()

  useEffect(() => {
    const percentage = Math.round((value / max) * 100)
    const shouldAnnounce = Math.floor(percentage / announceInterval) > Math.floor(lastAnnounced / announceInterval)

    if (shouldAnnounce || (percentage === 100 && lastAnnounced < 100)) {
      const message = formatMessage(value, max, percentage)
      announce(message, 'polite')
      setLastAnnounced(percentage)
    }
  }, [value, max, announceInterval, lastAnnounced, formatMessage, announce])

  return <AnnouncerComponent />
}

// ============================================================================
// STATUS ANNOUNCER
// ============================================================================

interface StatusAnnouncerProps {
  status: 'loading' | 'success' | 'error' | 'idle'
  messages?: {
    loading?: string
    success?: string
    error?: string
  }
  announceOnChange?: boolean
}

export function StatusAnnouncer({
  status,
  messages = {
    loading: 'Loading...',
    success: 'Operation completed successfully',
    error: 'An error occurred'
  },
  announceOnChange = true
}: StatusAnnouncerProps) {
  const { announce, AnnouncerComponent } = useAnnouncer()
  const previousStatus = useRef(status)

  useEffect(() => {
    if (announceOnChange && status !== previousStatus.current) {
      const message = messages[status as keyof typeof messages]
      if (message) {
        const priority = status === 'error' ? 'assertive' : 'polite'
        announce(message, priority)
      }
      previousStatus.current = status
    }
  }, [status, messages, announceOnChange, announce])

  return <AnnouncerComponent priority={status === 'error' ? 'assertive' : 'polite'} />
}

// ============================================================================
// FORM VALIDATION ANNOUNCER
// ============================================================================

interface FormValidationAnnouncerProps {
  errors: Record<string, string>
  fieldLabels?: Record<string, string>
  announceOnChange?: boolean
}

export function FormValidationAnnouncer({
  errors,
  fieldLabels = {},
  announceOnChange = true
}: FormValidationAnnouncerProps) {
  const { announce, AnnouncerComponent } = useAnnouncer()
  const previousErrors = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!announceOnChange) return

    const errorKeys = Object.keys(errors)
    const previousErrorKeys = Object.keys(previousErrors.current)

    // Check for new errors
    const newErrors = errorKeys.filter(key => 
      errors[key] && !previousErrors.current[key]
    )

    // Check for resolved errors
    const resolvedErrors = previousErrorKeys.filter(key => 
      previousErrors.current[key] && !errors[key]
    )

    if (newErrors.length > 0) {
      const messages = newErrors.map(key => {
        const fieldLabel = fieldLabels[key] || key
        return `${fieldLabel}: ${errors[key]}`
      })
      announce(`Validation errors: ${messages.join('. ')}`, 'assertive')
    } else if (resolvedErrors.length > 0 && newErrors.length === 0) {
      announce('Validation errors resolved', 'polite')
    }

    previousErrors.current = { ...errors }
  }, [errors, fieldLabels, announceOnChange, announce])

  return <AnnouncerComponent priority="assertive" />
}

// ============================================================================
// TABLE ANNOUNCER
// ============================================================================

interface TableAnnouncerProps {
  rowCount: number
  columnCount: number
  selectedCount?: number
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  filterCount?: number
}

export function TableAnnouncer({
  rowCount,
  columnCount,
  selectedCount = 0,
  sortColumn,
  sortDirection,
  filterCount
}: TableAnnouncerProps) {
  const { announce, AnnouncerComponent } = useAnnouncer()
  const previousValues = useRef({
    rowCount: 0,
    selectedCount: 0,
    sortColumn: '',
    sortDirection: 'asc' as 'asc' | 'desc'
  })

  useEffect(() => {
    const prev = previousValues.current

    // Announce row count changes
    if (rowCount !== prev.rowCount) {
      const message = filterCount 
        ? `Showing ${rowCount} of ${filterCount} filtered results`
        : `Table contains ${rowCount} rows and ${columnCount} columns`
      announce(message, 'polite')
    }

    // Announce selection changes
    if (selectedCount !== prev.selectedCount) {
      if (selectedCount === 0) {
        announce('No rows selected', 'polite')
      } else {
        announce(`${selectedCount} row${selectedCount === 1 ? '' : 's'} selected`, 'polite')
      }
    }

    // Announce sort changes
    if (sortColumn && (sortColumn !== prev.sortColumn || sortDirection !== prev.sortDirection)) {
      const direction = sortDirection === 'asc' ? 'ascending' : 'descending'
      announce(`Table sorted by ${sortColumn}, ${direction}`, 'polite')
    }

    previousValues.current = {
      rowCount,
      selectedCount,
      sortColumn: sortColumn || '',
      sortDirection: sortDirection || 'asc'
    }
  }, [rowCount, columnCount, selectedCount, sortColumn, sortDirection, filterCount, announce])

  return <AnnouncerComponent />
}

// ============================================================================
// NAVIGATION ANNOUNCER
// ============================================================================

interface NavigationAnnouncerProps {
  currentPage: string
  totalPages?: number
  breadcrumbs?: string[]
}

export function NavigationAnnouncer({
  currentPage,
  totalPages,
  breadcrumbs = []
}: NavigationAnnouncerProps) {
  const { announce, AnnouncerComponent } = useAnnouncer()
  const previousPage = useRef('')

  useEffect(() => {
    if (currentPage !== previousPage.current) {
      let message = `Navigated to ${currentPage}`
      
      if (breadcrumbs.length > 0) {
        message += `. Breadcrumb: ${breadcrumbs.join(', ')}`
      }
      
      if (totalPages) {
        message += `. Page content loaded`
      }

      announce(message, 'polite')
      previousPage.current = currentPage
    }
  }, [currentPage, totalPages, breadcrumbs, announce])

  return <AnnouncerComponent />
}

// ============================================================================
// SEARCH RESULTS ANNOUNCER
// ============================================================================

interface SearchResultsAnnouncerProps {
  query: string
  resultCount: number
  isLoading?: boolean
  hasError?: boolean
}

export function SearchResultsAnnouncer({
  query,
  resultCount,
  isLoading = false,
  hasError = false
}: SearchResultsAnnouncerProps) {
  const { announce, AnnouncerComponent } = useAnnouncer()
  const previousQuery = useRef('')
  const previousResultCount = useRef(-1)

  useEffect(() => {
    if (isLoading) {
      if (query !== previousQuery.current) {
        announce(`Searching for "${query}"...`, 'polite')
      }
      return
    }

    if (hasError) {
      announce('Search failed. Please try again.', 'assertive')
      return
    }

    if (query !== previousQuery.current || resultCount !== previousResultCount.current) {
      let message: string

      if (resultCount === 0) {
        message = `No results found for "${query}"`
      } else if (resultCount === 1) {
        message = `1 result found for "${query}"`
      } else {
        message = `${resultCount} results found for "${query}"`
      }

      announce(message, 'polite')
      
      previousQuery.current = query
      previousResultCount.current = resultCount
    }
  }, [query, resultCount, isLoading, hasError, announce])

  return <AnnouncerComponent />
}

// ============================================================================
// ACCESSIBLE DESCRIPTION
// ============================================================================

interface AccessibleDescriptionProps {
  children: React.ReactNode
  id?: string
  className?: string
}

export function AccessibleDescription({ 
  children, 
  id,
  className = ''
}: AccessibleDescriptionProps) {
  const generatedId = React.useId()
  const descriptionId = id || `description-${generatedId}`

  return (
    <div
      id={descriptionId}
      className={`text-sm text-gray-600 ${className}`}
    >
      {children}
    </div>
  )
}

// ============================================================================
// ACCESSIBLE LABEL
// ============================================================================

interface AccessibleLabelProps {
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
  className?: string
}

export function AccessibleLabel({ 
  children, 
  htmlFor,
  required = false,
  className = ''
}: AccessibleLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium text-gray-700 ${className}`}
    >
      {children}
      {required && (
        <>
          <span className="text-red-500 ml-1" aria-hidden="true">*</span>
          <ScreenReaderOnly>(required)</ScreenReaderOnly>
        </>
      )}
    </label>
  )
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Basic announcer usage:
const { announce, AnnouncerComponent } = useAnnouncer()

// Announce success
announce('Data saved successfully!', 'polite')

// Announce error
announce('Failed to save data', 'assertive')

// Include the component in your render
<AnnouncerComponent />

// Progress announcer:
<ProgressAnnouncer
  value={uploadProgress}
  max={100}
  label="File upload"
  announceInterval={25}
/>

// Status announcer:
<StatusAnnouncer
  status={apiStatus}
  messages={{
    loading: 'Loading fleet data...',
    success: 'Fleet data loaded successfully',
    error: 'Failed to load fleet data'
  }}
/>

// Form validation announcer:
<FormValidationAnnouncer
  errors={formErrors}
  fieldLabels={{
    email: 'Email address',
    password: 'Password'
  }}
/>

// Table announcer:
<TableAnnouncer
  rowCount={vehicles.length}
  columnCount={5}
  selectedCount={selectedVehicles.length}
  sortColumn="vehicleNumber"
  sortDirection="asc"
/>
*/
