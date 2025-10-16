'use client'

interface LoadingStateProps {
  message?: string
  className?: string
}

export function LoadingState({ 
  message = "Loading...", 
  className = "min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center" 
}: LoadingStateProps) {
  return (
    <div className={className}>
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">{message}</p>
      </div>
    </div>
  )
}

export function DataLoadingState({ message = "Loading fleet data..." }: { message?: string }) {
  return (
    <div className="text-center py-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-slate-600">{message}</p>
    </div>
  )
}
