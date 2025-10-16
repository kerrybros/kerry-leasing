/**
 * Focus management utilities for accessibility
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'

// ============================================================================
// FOCUS TRAP HOOK
// ============================================================================

export function useFocusTrap(isActive: boolean = true) {
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus()
          e.preventDefault()
        }
      }
    }

    // Focus first element when trap becomes active
    firstElement?.focus()

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isActive])

  return containerRef
}

// ============================================================================
// FOCUS RESTORATION HOOK
// ============================================================================

export function useFocusRestore() {
  const previousActiveElement = useRef<HTMLElement | null>(null)

  const saveFocus = useCallback(() => {
    previousActiveElement.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = useCallback(() => {
    if (previousActiveElement.current) {
      previousActiveElement.current.focus()
      previousActiveElement.current = null
    }
  }, [])

  return { saveFocus, restoreFocus }
}

// ============================================================================
// ROVING TABINDEX HOOK
// ============================================================================

interface RovingTabIndexOptions {
  orientation?: 'horizontal' | 'vertical' | 'both'
  loop?: boolean
  onSelectionChange?: (index: number) => void
}

export function useRovingTabIndex(
  itemCount: number,
  options: RovingTabIndexOptions = {}
) {
  const { orientation = 'horizontal', loop = true, onSelectionChange } = options
  const [activeIndex, setActiveIndex] = useState(0)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  const setItemRef = useCallback((index: number) => (element: HTMLElement | null) => {
    itemRefs.current[index] = element
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let newIndex = index

    switch (e.key) {
      case 'ArrowRight':
        if (orientation === 'horizontal' || orientation === 'both') {
          newIndex = index + 1
          if (newIndex >= itemCount) {
            newIndex = loop ? 0 : itemCount - 1
          }
          e.preventDefault()
        }
        break
      case 'ArrowLeft':
        if (orientation === 'horizontal' || orientation === 'both') {
          newIndex = index - 1
          if (newIndex < 0) {
            newIndex = loop ? itemCount - 1 : 0
          }
          e.preventDefault()
        }
        break
      case 'ArrowDown':
        if (orientation === 'vertical' || orientation === 'both') {
          newIndex = index + 1
          if (newIndex >= itemCount) {
            newIndex = loop ? 0 : itemCount - 1
          }
          e.preventDefault()
        }
        break
      case 'ArrowUp':
        if (orientation === 'vertical' || orientation === 'both') {
          newIndex = index - 1
          if (newIndex < 0) {
            newIndex = loop ? itemCount - 1 : 0
          }
          e.preventDefault()
        }
        break
      case 'Home':
        newIndex = 0
        e.preventDefault()
        break
      case 'End':
        newIndex = itemCount - 1
        e.preventDefault()
        break
    }

    if (newIndex !== index) {
      setActiveIndex(newIndex)
      itemRefs.current[newIndex]?.focus()
      onSelectionChange?.(newIndex)
    }
  }, [itemCount, orientation, loop, onSelectionChange])

  const getItemProps = useCallback((index: number) => ({
    ref: setItemRef(index),
    tabIndex: index === activeIndex ? 0 : -1,
    onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
    onFocus: () => setActiveIndex(index),
  }), [activeIndex, setItemRef, handleKeyDown])

  return {
    activeIndex,
    setActiveIndex,
    getItemProps,
  }
}

// ============================================================================
// SKIP LINK COMPONENT
// ============================================================================

interface SkipLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

export function SkipLink({ href, children, className = '' }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={`
        sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 
        bg-blue-600 text-white px-4 py-2 rounded-md z-50 font-medium
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${className}
      `}
    >
      {children}
    </a>
  )
}

// ============================================================================
// FOCUS VISIBLE UTILITY
// ============================================================================

export function useFocusVisible() {
  const [isFocusVisible, setIsFocusVisible] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let hadKeyboardEvent = false

    const onKeyDown = () => {
      hadKeyboardEvent = true
    }

    const onMouseDown = () => {
      hadKeyboardEvent = false
    }

    const onFocus = () => {
      setIsFocusVisible(hadKeyboardEvent)
    }

    const onBlur = () => {
      setIsFocusVisible(false)
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    element.addEventListener('focus', onFocus)
    element.addEventListener('blur', onBlur)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      element.removeEventListener('focus', onFocus)
      element.removeEventListener('blur', onBlur)
    }
  }, [])

  return { isFocusVisible, ref }
}

// ============================================================================
// LIVE REGION COMPONENT
// ============================================================================

interface LiveRegionProps {
  children: React.ReactNode
  politeness?: 'polite' | 'assertive' | 'off'
  atomic?: boolean
  relevant?: 'additions' | 'removals' | 'text' | 'all'
  className?: string
}

export function LiveRegion({
  children,
  politeness = 'polite',
  atomic = false,
  relevant = 'all',
  className = '',
}: LiveRegionProps) {
  return (
    <div
      aria-live={politeness}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className={`sr-only ${className}`}
    >
      {children}
    </div>
  )
}

// ============================================================================
// ACCESSIBLE MODAL COMPONENT
// ============================================================================

interface AccessibleModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  closeOnEscape?: boolean
  closeOnOverlayClick?: boolean
}

export function AccessibleModal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  closeOnEscape = true,
  closeOnOverlayClick = true,
}: AccessibleModalProps) {
  const modalRef = useFocusTrap(isOpen)
  const { saveFocus, restoreFocus } = useFocusRestore()
  const titleId = `modal-title-${React.useId()}`

  useEffect(() => {
    if (isOpen) {
      saveFocus()
      document.body.style.overflow = 'hidden'
    } else {
      restoreFocus()
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, saveFocus, restoreFocus])

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeOnEscape, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`
          relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6
          focus:outline-none
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="
              text-gray-400 hover:text-gray-600 focus:outline-none 
              focus:ring-2 focus:ring-blue-500 rounded-md p-1
            "
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  )
}

// ============================================================================
// ACCESSIBLE DROPDOWN COMPONENT
// ============================================================================

interface AccessibleDropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  className?: string
}

export function AccessibleDropdown({
  trigger,
  children,
  isOpen,
  onToggle,
  onClose,
  placement = 'bottom-start',
  className = '',
}: AccessibleDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerId = `dropdown-trigger-${React.useId()}`
  const menuId = `dropdown-menu-${React.useId()}`

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const placementClasses = {
    'bottom-start': 'top-full left-0 mt-1',
    'bottom-end': 'top-full right-0 mt-1',
    'top-start': 'bottom-full left-0 mb-1',
    'top-end': 'bottom-full right-0 mb-1',
  }

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Trigger */}
      <div
        id={triggerId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={menuId}
        role="button"
        tabIndex={0}
        className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
      >
        {trigger}
      </div>

      {/* Menu */}
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={`
            absolute z-50 bg-white border border-gray-200 rounded-md shadow-lg
            focus:outline-none
            ${placementClasses[placement]}
            ${className}
          `}
        >
          {children}
        </div>
      )}
    </div>
  )
}
