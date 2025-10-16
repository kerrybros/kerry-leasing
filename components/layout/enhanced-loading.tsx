'use client'

import React from 'react'
import { useLoadingManager, LoadingState, LoadingPriority } from '@/lib/state/loading-manager'
import { Card, CardContent } from '@/components/ui/card'

interface EnhancedLoadingProps {
  className?: string
  showProgress?: boolean
  showMultiple?: boolean
  minDisplayTime?: number
}

export function EnhancedLoading({ 
  className = "min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center",
  showProgress = true,
  showMultiple = false,
  minDisplayTime = 500
}: EnhancedLoadingProps) {
  const { getHighPriorityLoading, getLoadingStates } = useLoadingManager()
  
  const highPriorityStates = getHighPriorityLoading()
  const allStates = getLoadingStates()
  
  // Show high priority loading first, fallback to any loading
  const loadingStates = highPriorityStates.length > 0 ? highPriorityStates : allStates
  
  if (loadingStates.length === 0) {
    return null
  }

  // Show multiple loading states or just the first one
  const statesToShow = showMultiple ? loadingStates : [loadingStates[0]]

  return (
    <div className={className}>
      <div className="text-center max-w-md w-full">
        {statesToShow.map((state, index) => (
          <LoadingStateDisplay 
            key={state.id}
            state={state}
            showProgress={showProgress}
            isFirst={index === 0}
          />
        ))}
      </div>
    </div>
  )
}

interface LoadingStateDisplayProps {
  state: LoadingState
  showProgress: boolean
  isFirst: boolean
}

function LoadingStateDisplay({ state, showProgress, isFirst }: LoadingStateDisplayProps) {
  const getPriorityColor = (priority: LoadingPriority) => {
    switch (priority) {
      case LoadingPriority.CRITICAL: return 'border-red-500'
      case LoadingPriority.HIGH: return 'border-orange-500'
      case LoadingPriority.MEDIUM: return 'border-blue-500'
      case LoadingPriority.LOW: return 'border-gray-400'
    }
  }

  const getSpinnerColor = (priority: LoadingPriority) => {
    switch (priority) {
      case LoadingPriority.CRITICAL: return 'border-red-600'
      case LoadingPriority.HIGH: return 'border-orange-600'
      case LoadingPriority.MEDIUM: return 'border-blue-600'
      case LoadingPriority.LOW: return 'border-gray-500'
    }
  }

  const duration = Date.now() - state.startTime.getTime()
  const showDuration = duration > 2000 // Show duration after 2 seconds

  return (
    <Card className={`${getPriorityColor(state.priority)} ${isFirst ? 'mb-4' : 'mb-2'}`}>
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Spinner */}
          <div className={`relative ${isFirst ? 'w-12 h-12' : 'w-8 h-8'}`}>
            <div className={`
              ${isFirst ? 'w-12 h-12 border-4' : 'w-8 h-8 border-2'} 
              ${getSpinnerColor(state.priority)} 
              border-t-transparent rounded-full animate-spin
            `}></div>
            
            {/* Progress ring overlay */}
            {showProgress && state.progress !== undefined && (
              <div className="absolute inset-0">
                <svg className={`${isFirst ? 'w-12 h-12' : 'w-8 h-8'} transform -rotate-90`}>
                  <circle
                    cx="50%"
                    cy="50%"
                    r={isFirst ? "20" : "14"}
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="50%"
                    cy="50%"
                    r={isFirst ? "20" : "14"}
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * (isFirst ? 20 : 14)}`}
                    strokeDashoffset={`${2 * Math.PI * (isFirst ? 20 : 14) * (1 - state.progress / 100)}`}
                    className={getSpinnerColor(state.priority).replace('border-', 'text-')}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Message */}
          <div className="text-center">
            <p className={`text-slate-700 font-medium ${isFirst ? 'text-lg' : 'text-sm'}`}>
              {state.message}
            </p>
            
            {/* Progress percentage */}
            {showProgress && state.progress !== undefined && (
              <p className="text-sm text-slate-500 mt-1">
                {Math.round(state.progress)}%
              </p>
            )}
            
            {/* Duration for long operations */}
            {showDuration && (
              <p className="text-xs text-slate-400 mt-1">
                {Math.round(duration / 1000)}s
              </p>
            )}
            
            {/* Priority indicator for non-medium priority */}
            {state.priority !== LoadingPriority.MEDIUM && (
              <span className={`
                inline-block px-2 py-1 text-xs rounded-full mt-2
                ${state.priority === LoadingPriority.CRITICAL ? 'bg-red-100 text-red-700' : ''}
                ${state.priority === LoadingPriority.HIGH ? 'bg-orange-100 text-orange-700' : ''}
                ${state.priority === LoadingPriority.LOW ? 'bg-gray-100 text-gray-600' : ''}
              `}>
                {state.priority.toLowerCase()}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Inline loading component for smaller spaces
 */
export function InlineLoading({ 
  message = "Loading...", 
  size = "sm",
  showText = true 
}: { 
  message?: string
  size?: "xs" | "sm" | "md" | "lg"
  showText?: boolean 
}) {
  const sizeClasses = {
    xs: "w-3 h-3 border",
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-2"
  }

  const textSizeClasses = {
    xs: "text-xs",
    sm: "text-sm", 
    md: "text-base",
    lg: "text-lg"
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`
        ${sizeClasses[size]} 
        border-blue-600 border-t-transparent rounded-full animate-spin
      `}></div>
      {showText && (
        <span className={`text-slate-600 ${textSizeClasses[size]}`}>
          {message}
        </span>
      )}
    </div>
  )
}

/**
 * Button loading state component
 */
export function ButtonLoading({ 
  size = "sm" 
}: { 
  size?: "xs" | "sm" | "md" 
}) {
  const sizeClasses = {
    xs: "w-3 h-3 border",
    sm: "w-4 h-4 border-2", 
    md: "w-5 h-5 border-2"
  }

  return (
    <div className={`
      ${sizeClasses[size]} 
      border-current border-t-transparent rounded-full animate-spin
    `}></div>
  )
}

/**
 * Global loading overlay for critical operations
 */
export function GlobalLoadingOverlay() {
  const { getHighPriorityLoading } = useLoadingManager()
  const criticalLoading = getHighPriorityLoading().filter(
    state => state.priority === LoadingPriority.CRITICAL
  )

  if (criticalLoading.length === 0) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <EnhancedLoading 
          className=""
          showProgress={true}
          showMultiple={false}
        />
      </div>
    </div>
  )
}
