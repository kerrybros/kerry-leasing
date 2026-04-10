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
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendLineChart } from './TrendLineChart';
import type { MonthlyMetrics, UnitMetrics, DriverMetrics, FleetTotals } from '@/features/fleet/types';

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

        {/* Pie Charts — side by side at the top */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Fuel Usage Breakdown */}
          <Card className="flex-1">
            <CardContent className="relative pt-4">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                Fuel Usage
              </div>
              {fleetTotals.totalIdleFuel > 0 || fleetTotals.totalDrivingFuel > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Idle Fuel', value: Math.round(fleetTotals.totalIdleFuel) },
                        { name: 'Driving Fuel', value: Math.round(fleetTotals.totalDrivingFuel) },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      <Cell fill="#ef4444" />
                      <Cell fill="#d9a528" />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, color: '#ccc' }} formatter={(val) => [`${Number(val).toLocaleString()} gal`]} />
                    <Legend formatter={(name) => <span style={{ fontSize: 11, color: '#aaa' }}>{name}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={[{ name: 'No Data', value: 1 }]} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" stroke="none">
                        <Cell fill="#333" />
                      </Pie>
                      <Legend formatter={() => <span style={{ fontSize: 11, color: '#555' }}>Idle Fuel / Driving Fuel</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span style={{ fontSize: 13, color: '#555', fontWeight: 500, marginTop: -8 }}>No data available</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Drive Time vs Idle Time */}
          <Card className="flex-1">
            <CardContent className="relative pt-4">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                Drive vs Idle Time
              </div>
              {fleetTotals.totalIdleTime > 0 || fleetTotals.totalDrivingTime > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Idle Time', value: fleetTotals.totalIdleTime },
                        { name: 'Drive Time', value: fleetTotals.totalDrivingTime },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      <Cell fill="#ef4444" />
                      <Cell fill="#22c55e" />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 4, color: '#ccc' }} formatter={(val) => [`${Number(val).toLocaleString()} min`]} />
                    <Legend formatter={(name) => <span style={{ fontSize: 11, color: '#aaa' }}>{name}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={[{ name: 'No Data', value: 1 }]} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" stroke="none">
                        <Cell fill="#333" />
                      </Pie>
                      <Legend formatter={() => <span style={{ fontSize: 11, color: '#555' }}>Idle Time / Drive Time</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  <span style={{ fontSize: 13, color: '#555', fontWeight: 500, marginTop: -8 }}>No data available</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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

      {/* RIGHT COLUMN — FILTERS + MONTHLY TABLE (sticky) */}
      <div className="lg:col-span-4 flex flex-col gap-4" style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
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
        <Card className="flex flex-col overflow-hidden">
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
          <CardContent className="p-0">
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
