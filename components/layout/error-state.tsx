'use client'

import { UserButton } from '@clerk/nextjs'

interface ErrorStateProps {
  title?: string
  message?: string
  showUserButton?: boolean
}

export function ErrorState({ 
  title = "Access Not Configured",
  message = "Your account doesn't have fleet access configured. Please contact support.",
  showUserButton = true
}: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">{title}</h2>
        <p className="text-slate-600 mb-4">{message}</p>
        {showUserButton && <UserButton afterSignOutUrl="/" />}
      </div>
    </div>
  )
}
