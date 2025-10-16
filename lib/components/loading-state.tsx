import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
        sizeClasses[size],
        className
      )}
    />
  )
}

interface LoadingCardProps {
  title?: string
  description?: string
  className?: string
}

export function LoadingCard({ title, description, className }: LoadingCardProps) {
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="text-center">
        <div className="flex flex-col items-center space-y-4">
          <LoadingSpinner size="lg" />
          {title && (
            <h3 className="text-lg font-semibold text-gray-900">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-gray-600">
              {description}
            </p>
          )}
        </div>
      </CardHeader>
    </Card>
  )
}

export function LoadingTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </td>
      ))}
    </tr>
  )
}

export function LoadingTable({ 
  rows = 5, 
  columns = 4,
  headers 
}: { 
  rows?: number
  columns?: number
  headers?: string[]
}) {
  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        {headers && (
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, i) => (
            <LoadingTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LoadingGrid({ 
  items = 6,
  className 
}: { 
  items?: number
  className?: string 
}) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
              <div className="h-3 bg-gray-200 rounded w-4/6"></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface LoadingStateProps {
  type?: 'spinner' | 'card' | 'table' | 'grid'
  title?: string
  description?: string
  className?: string
  // Table specific
  rows?: number
  columns?: number
  headers?: string[]
  // Grid specific
  items?: number
}

export function LoadingState({
  type = 'spinner',
  title,
  description,
  className,
  rows,
  columns,
  headers,
  items,
}: LoadingStateProps) {
  switch (type) {
    case 'card':
      return (
        <LoadingCard
          title={title}
          description={description}
          className={className}
        />
      )
    case 'table':
      return (
        <LoadingTable
          rows={rows}
          columns={columns}
          headers={headers}
        />
      )
    case 'grid':
      return (
        <LoadingGrid
          items={items}
          className={className}
        />
      )
    default:
      return (
        <div className={cn('flex flex-col items-center justify-center p-8', className)}>
          <LoadingSpinner size="lg" />
          {title && (
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-2 text-sm text-gray-600 text-center max-w-sm">
              {description}
            </p>
          )}
        </div>
      )
  }
}
