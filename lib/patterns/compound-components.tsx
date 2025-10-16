/**
 * Advanced compound component patterns for flexible and reusable UI components
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ============================================================================
// DASHBOARD CARD COMPOUND COMPONENT
// ============================================================================

interface DashboardCardContextValue {
  isExpanded: boolean
  toggleExpanded: () => void
  variant: 'default' | 'compact' | 'detailed'
  onAction?: (actionId: string) => void
}

const DashboardCardContext = createContext<DashboardCardContextValue | null>(null)

function useDashboardCard() {
  const context = useContext(DashboardCardContext)
  if (!context) {
    throw new Error('Dashboard card components must be used within DashboardCard')
  }
  return context
}

interface DashboardCardProps {
  children: React.ReactNode
  variant?: 'default' | 'compact' | 'detailed'
  defaultExpanded?: boolean
  onAction?: (actionId: string) => void
  className?: string
}

function DashboardCardRoot({ 
  children, 
  variant = 'default', 
  defaultExpanded = false, 
  onAction,
  className = ''
}: DashboardCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const contextValue = useMemo(() => ({
    isExpanded,
    toggleExpanded,
    variant,
    onAction,
  }), [isExpanded, toggleExpanded, variant, onAction])

  return (
    <DashboardCardContext.Provider value={contextValue}>
      <Card className={`transition-all duration-200 ${className} ${
        isExpanded ? 'shadow-lg scale-[1.02]' : 'hover:shadow-md'
      }`}>
        {children}
      </Card>
    </DashboardCardContext.Provider>
  )
}

interface DashboardCardHeaderProps {
  children: React.ReactNode
  icon?: React.ReactNode
  expandable?: boolean
  className?: string
}

function DashboardCardHeaderComponent({ 
  children, 
  icon, 
  expandable = false,
  className = ''
}: DashboardCardHeaderProps) {
  const { isExpanded, toggleExpanded, variant } = useDashboardCard()

  return (
    <CardHeader className={`${className} ${
      variant === 'compact' ? 'pb-2' : ''
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <div>{children}</div>
        </div>
        {expandable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className="h-6 w-6 p-0"
          >
            <svg
              className={`h-4 w-4 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Button>
        )}
      </div>
    </CardHeader>
  )
}

interface DashboardCardContentProps {
  children: React.ReactNode
  collapsible?: boolean
  className?: string
}

function DashboardCardContentComponent({ 
  children, 
  collapsible = false,
  className = ''
}: DashboardCardContentProps) {
  const { isExpanded, variant } = useDashboardCard()

  if (collapsible && !isExpanded) {
    return null
  }

  return (
    <CardContent className={`${className} ${
      variant === 'compact' ? 'pt-0' : ''
    }`}>
      {children}
    </CardContent>
  )
}

interface DashboardCardActionsProps {
  children: React.ReactNode
  className?: string
}

function DashboardCardActionsComponent({ children, className = '' }: DashboardCardActionsProps) {
  const { variant } = useDashboardCard()

  return (
    <div className={`flex gap-2 ${
      variant === 'compact' ? 'mt-2' : 'mt-4'
    } ${className}`}>
      {children}
    </div>
  )
}

interface DashboardCardActionProps {
  children: React.ReactNode
  actionId: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'lg'
  disabled?: boolean
}

function DashboardCardActionComponent({ 
  children, 
  actionId, 
  variant = 'default',
  size = 'sm',
  disabled = false
}: DashboardCardActionProps) {
  const { onAction } = useDashboardCard()

  const handleClick = useCallback(() => {
    onAction?.(actionId)
  }, [onAction, actionId])

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}

// Compound component exports
export const DashboardCard = Object.assign(DashboardCardRoot, {
  Header: DashboardCardHeaderComponent,
  Title: CardTitle,
  Description: CardDescription,
  Content: DashboardCardContentComponent,
  Actions: DashboardCardActionsComponent,
  Action: DashboardCardActionComponent,
})

// ============================================================================
// DATA TABLE COMPOUND COMPONENT
// ============================================================================

interface DataTableContextValue {
  data: any[]
  columns: TableColumn[]
  sortBy: string | null
  sortDirection: 'asc' | 'desc'
  selectedRows: Set<string>
  onSort: (columnId: string) => void
  onSelectRow: (rowId: string) => void
  onSelectAll: () => void
}

const DataTableContext = createContext<DataTableContextValue | null>(null)

function useDataTable() {
  const context = useContext(DataTableContext)
  if (!context) {
    throw new Error('DataTable components must be used within DataTable')
  }
  return context
}

interface TableColumn {
  id: string
  header: string
  accessor: string | ((row: any) => any)
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
  render?: (value: any, row: any) => React.ReactNode
}

interface DataTableProps {
  data: any[]
  columns: TableColumn[]
  children: React.ReactNode
  onRowSelect?: (selectedRows: string[]) => void
  defaultSort?: { column: string; direction: 'asc' | 'desc' }
  className?: string
}

function DataTableRoot({ 
  data, 
  columns, 
  children, 
  onRowSelect,
  defaultSort,
  className = ''
}: DataTableProps) {
  const [sortBy, setSortBy] = useState<string | null>(defaultSort?.column || null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSort?.direction || 'asc')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const onSort = useCallback((columnId: string) => {
    if (sortBy === columnId) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(columnId)
      setSortDirection('asc')
    }
  }, [sortBy])

  const onSelectRow = useCallback((rowId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      onRowSelect?.(Array.from(newSet))
      return newSet
    })
  }, [onRowSelect])

  const onSelectAll = useCallback(() => {
    const allRowIds = data.map((row, index) => row.id || index.toString())
    const isAllSelected = allRowIds.every(id => selectedRows.has(id))
    
    if (isAllSelected) {
      setSelectedRows(new Set())
      onRowSelect?.([])
    } else {
      setSelectedRows(new Set(allRowIds))
      onRowSelect?.(allRowIds)
    }
  }, [data, selectedRows, onRowSelect])

  const contextValue = useMemo(() => ({
    data,
    columns,
    sortBy,
    sortDirection,
    selectedRows,
    onSort,
    onSelectRow,
    onSelectAll,
  }), [data, columns, sortBy, sortDirection, selectedRows, onSort, onSelectRow, onSelectAll])

  return (
    <DataTableContext.Provider value={contextValue}>
      <div className={`overflow-hidden rounded-lg border ${className}`}>
        {children}
      </div>
    </DataTableContext.Provider>
  )
}

function DataTableHeaderComponent() {
  const { columns, sortBy, sortDirection, onSort, selectedRows, data, onSelectAll } = useDataTable()
  const isAllSelected = data.length > 0 && data.every((row, index) => 
    selectedRows.has(row.id || index.toString())
  )

  return (
    <div className="bg-gray-50 border-b">
      <div className="flex">
        <div className="w-12 px-4 py-3 flex items-center justify-center">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={onSelectAll}
            className="rounded border-gray-300"
          />
        </div>
        {columns.map((column) => (
          <div
            key={column.id}
            className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
              column.width || 'flex-1'
            } ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''}`}
            style={{ width: column.width }}
          >
            {column.sortable ? (
              <button
                onClick={() => onSort(column.id)}
                className="flex items-center gap-1 hover:text-gray-700"
              >
                {column.header}
                {sortBy === column.id && (
                  <svg
                    className={`h-3 w-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                )}
              </button>
            ) : (
              column.header
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataTableBodyComponent() {
  const { data, columns, selectedRows, onSelectRow, sortBy, sortDirection } = useDataTable()

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortBy) return data

    const column = columns.find(col => col.id === sortBy)
    if (!column) return data

    return [...data].sort((a, b) => {
      let aValue: any
      let bValue: any

      if (typeof column.accessor === 'function') {
        aValue = column.accessor(a)
        bValue = column.accessor(b)
      } else {
        aValue = a[column.accessor]
        bValue = b[column.accessor]
      }

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [data, columns, sortBy, sortDirection])

  return (
    <div className="bg-white divide-y divide-gray-200">
      {sortedData.map((row, index) => {
        const rowId = row.id || index.toString()
        const isSelected = selectedRows.has(rowId)

        return (
          <div key={rowId} className={`flex hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
            <div className="w-12 px-4 py-4 flex items-center justify-center">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelectRow(rowId)}
                className="rounded border-gray-300"
              />
            </div>
            {columns.map((column) => {
              let value: any
              if (typeof column.accessor === 'function') {
                value = column.accessor(row)
              } else {
                value = row[column.accessor]
              }

              const displayValue = column.render ? column.render(value, row) : value

              return (
                <div
                  key={column.id}
                  className={`px-4 py-4 text-sm text-gray-900 ${
                    column.width || 'flex-1'
                  } ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''}`}
                  style={{ width: column.width }}
                >
                  {displayValue}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function DataTableEmptyComponent({ children }: { children: React.ReactNode }) {
  const { data } = useDataTable()

  if (data.length > 0) return null

  return (
    <div className="bg-white px-4 py-12 text-center">
      {children}
    </div>
  )
}

// Compound component exports
export const DataTable = Object.assign(DataTableRoot, {
  Header: DataTableHeaderComponent,
  Body: DataTableBodyComponent,
  Empty: DataTableEmptyComponent,
})

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Dashboard Card Usage:
<DashboardCard variant="detailed" onAction={(actionId) => console.log(actionId)}>
  <DashboardCard.Header icon={<TruckIcon />} expandable>
    <DashboardCard.Title>Fleet Overview</DashboardCard.Title>
    <DashboardCard.Description>Current fleet status and metrics</DashboardCard.Description>
  </DashboardCard.Header>
  
  <DashboardCard.Content>
    <div>Fleet content here...</div>
  </DashboardCard.Content>
  
  <DashboardCard.Content collapsible>
    <div>Expandable content here...</div>
    <DashboardCard.Actions>
      <DashboardCard.Action actionId="view-details">View Details</DashboardCard.Action>
      <DashboardCard.Action actionId="export" variant="outline">Export</DashboardCard.Action>
    </DashboardCard.Actions>
  </DashboardCard.Content>
</DashboardCard>

// Data Table Usage:
<DataTable 
  data={vehicles} 
  columns={vehicleColumns}
  onRowSelect={(selected) => console.log(selected)}
  defaultSort={{ column: 'vehicleNumber', direction: 'asc' }}
>
  <DataTable.Header />
  <DataTable.Body />
  <DataTable.Empty>
    <div>No vehicles found</div>
  </DataTable.Empty>
</DataTable>
*/
