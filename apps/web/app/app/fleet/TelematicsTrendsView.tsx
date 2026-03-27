'use client';

import { MultiSelect } from '@/components/MultiSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendLineChart } from './TrendLineChart';
import type { MonthlyMetrics, UnitMetrics, DriverMetrics, FleetTotals } from './types';

interface TelematicsTrendsViewProps {
  loading: boolean;
  viewMode: 'unit' | 'driver';
  onViewModeChange: (mode: 'unit' | 'driver') => void;
  tracksDrivers: boolean;
  selectedId: string | number | null;
  onSelectedIdChange: (id: string | number | null) => void;
  unitMetrics: UnitMetrics[];
  driverMetrics: DriverMetrics[];
  unitOptions: { label: string; value: string }[];
  driverOptions: { label: string; value: string }[];
  selectedUnits: string[];
  selectedDrivers: string[];
  onUnitsChange: (v: string[]) => void;
  onDriversChange: (v: string[]) => void;
  monthlyMetrics: { chartData: MonthlyMetrics[]; tableData: MonthlyMetrics[] };
  fleetTotals: FleetTotals;
  showYearToggle: boolean;
  availableYears: number[];
  selectedTableYear: number;
  onTableYearChange: (year: number) => void;
}

export function TelematicsTrendsView({
  loading,
  viewMode,
  onViewModeChange,
  tracksDrivers,
  selectedId,
  onSelectedIdChange,
  unitMetrics,
  driverMetrics,
  unitOptions,
  driverOptions,
  selectedUnits,
  selectedDrivers,
  onUnitsChange,
  onDriversChange,
  monthlyMetrics,
  fleetTotals,
  showYearToggle,
  availableYears,
  selectedTableYear,
  onTableYearChange,
}: TelematicsTrendsViewProps) {
  const clearFilters = () => {
    if (viewMode === 'unit') onUnitsChange([]);
    else onDriversChange([]);
  };

  const options = viewMode === 'unit' ? unitOptions : driverOptions;
  const selected = viewMode === 'unit' ? selectedUnits : selectedDrivers;
  const labels = options.filter(o => selected.includes(o.value)).map(o => o.label);

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* LEFT COLUMN — CHARTS */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Selection label */}
        <p className="h-5 text-sm italic text-muted-foreground flex items-center gap-3">
          {selectedId ? (
            <>
              <span>
                {`Showing data for ${viewMode === 'unit' ? 'Unit' : 'Driver'}: ${
                  viewMode === 'unit'
                    ? unitMetrics.find(u => u.vin === selectedId)?.unitNumber || selectedId
                    : driverMetrics.find(d => d.driverId === selectedId)?.driverName || selectedId
                }`}
              </span>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onSelectedIdChange(null)}>
                Clear Selection
              </Button>
            </>
          ) : labels.length > 0 ? (
            <>
              {labels.length > 5 ? (
                <div className="group relative cursor-pointer flex items-center gap-1">
                  <span className="hover:text-foreground transition-colors">
                    Showing: {labels.slice(0, 5).join(', ')}... (+{labels.length - 5} others)
                  </span>
                  <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <div className="absolute left-0 top-full mt-2 w-[600px] bg-card border border-border rounded-lg shadow-xl hidden group-hover:block z-50">
                    <div className="sticky top-0 bg-muted px-3 py-2 border-b border-border rounded-t-lg">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Selected {viewMode === 'unit' ? 'Units' : 'Drivers'} ({labels.length})
                      </span>
                    </div>
                    <div className="p-3 max-h-[400px] overflow-y-auto flex flex-wrap gap-2">
                      {labels.map((label, i) => (
                        <span key={i} className="px-2 py-1 bg-muted rounded text-sm border border-border text-foreground font-normal not-italic">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <span>Showing: {labels.join(', ')}</span>
              )}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={clearFilters}>
                Clear Selection
              </Button>
            </>
          ) : (
            <span>{`Showing fleet-wide ${viewMode} averages`}</span>
          )}
        </p>

        <TrendLineChart title="MPG" dataKey="avgMpg" data={monthlyMetrics.chartData} loading={loading} />
        <TrendLineChart
          title="Idle %"
          dataKey="idlePercentage"
          data={monthlyMetrics.chartData}
          loading={loading}
          labelFormatter={(val: unknown) => `${val}%`}
        />
        <TrendLineChart
          title="Miles Driven"
          dataKey="totalMiles"
          data={monthlyMetrics.chartData}
          loading={loading}
          labelFormatter={(val: unknown) =>
            typeof val === 'number' && val >= 1000 ? `${(val / 1000).toFixed(0)}K` : String(val)
          }
        />
      </div>

      {/* RIGHT COLUMN — FILTERS + MONTHLY TABLE */}
      <div className="lg:col-span-4 flex flex-col gap-4 h-full">
        <div className="flex flex-col gap-2">
          {tracksDrivers && (
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button
                variant={viewMode === 'unit' ? 'default' : 'ghost'}
                className="flex-1 rounded-none border-0"
                onClick={() => onViewModeChange('unit')}
              >
                Unit
              </Button>
              <Button
                variant={viewMode === 'driver' ? 'default' : 'ghost'}
                className="flex-1 rounded-none border-0 border-l border-border"
                onClick={() => onViewModeChange('driver')}
              >
                Driver
              </Button>
            </div>
          )}
          {viewMode === 'unit' ? (
            <MultiSelect
              options={unitOptions}
              selected={selectedUnits}
              onChange={onUnitsChange}
              placeholder="Filter Units..."
              className="w-full"
            />
          ) : (
            tracksDrivers && (
              <MultiSelect
                options={driverOptions}
                selected={selectedDrivers}
                onChange={onDriversChange}
                placeholder="Filter Drivers..."
                className="w-full"
              />
            )
          )}
        </div>

        {/* Monthly Summary Table */}
        <Card className="flex flex-col flex-1 overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Monthly Summary
            </CardTitle>
            {showYearToggle && (
              <div className="flex gap-1">
                {availableYears.map(year => (
                  <Button
                    key={year}
                    size="sm"
                    variant={selectedTableYear === year ? 'default' : 'outline'}
                    className="h-6 px-2 text-xs"
                    onClick={e => { e.stopPropagation(); onTableYearChange(year); }}
                  >
                    {year}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto min-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Month</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">MPG</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Miles</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle %</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle Fuel</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle (min)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyMetrics.tableData.map(month => (
                  <TableRow key={month.monthKey} className={month.totalMiles === 0 ? 'opacity-40' : ''}>
                    <TableCell className="font-semibold">{month.month}</TableCell>
                    <TableCell>{month.avgMpg.toFixed(2)}</TableCell>
                    <TableCell>{month.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">{month.idlePercentage.toFixed(2)}%</TableCell>
                    <TableCell>{month.idleFuel.toLocaleString()}</TableCell>
                    <TableCell>{month.idleTimeMinutes.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-primary/10 font-bold border-t-2">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="font-bold">{fleetTotals.avgMpg}</TableCell>
                  <TableCell className="font-bold">{fleetTotals.totalMiles.toLocaleString()}</TableCell>
                  <TableCell className="font-bold">{fleetTotals.idlePercentage}%</TableCell>
                  <TableCell className="font-bold">{fleetTotals.totalIdleFuel.toLocaleString()}</TableCell>
                  <TableCell className="font-bold">{fleetTotals.totalIdleTime.toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
