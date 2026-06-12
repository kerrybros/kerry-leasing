'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE, LEGEND_STYLE } from '@/features/fleet/utils/chartColors';
import { TrendLineChart } from './TrendLineChart';
import type { MonthlyMetrics, FleetTotals } from '@/features/fleet/types';

interface TelematicsTrendsViewProps {
  loading: boolean;
  monthlyMetrics: { chartData: MonthlyMetrics[]; tableData: MonthlyMetrics[] };
  fleetTotals: FleetTotals;
  monthlyTableTotals: FleetTotals;
  showYearToggle: boolean;
  availableYears: number[];
  selectedTableYear: number;
  onTableYearChange: (year: number) => void;
}

function fmtIdleTime(minutes: number): string {
  const totalMin = Math.round(minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function TelematicsTrendsView({
  loading,
  monthlyMetrics,
  fleetTotals,
  monthlyTableTotals,
  showYearToggle,
  availableYears,
  selectedTableYear,
  onTableYearChange,
}: TelematicsTrendsViewProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div style={{ display: 'flex', gap: 16 }}>
              <Skeleton style={{ flex: 1, height: 220, borderRadius: 8 }} />
              <Skeleton style={{ flex: 1, height: 220, borderRadius: 8 }} />
            </div>
            <Skeleton style={{ height: 220, borderRadius: 8 }} />
            <Skeleton style={{ height: 220, borderRadius: 8 }} />
            <Skeleton style={{ height: 220, borderRadius: 8 }} />
          </div>
          <div className="lg:col-span-4">
            <Skeleton style={{ height: 400, borderRadius: 8 }} />
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-4">
      {/* TWO-COLUMN LAYOUT — charts left, monthly summary right */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN — CHARTS */}
        <div className="lg:col-span-8 flex flex-col gap-4">
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
                        <Cell fill={CHART_COLORS.primary} />
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [`${Number(val).toLocaleString()} gal`]} />
                      <Legend formatter={(name) => <span style={LEGEND_STYLE}>{name}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <svg width={150} height={150} viewBox="0 0 150 150">
                      <circle cx={75} cy={75} r={62} fill="none" stroke="var(--muted)" strokeWidth={25} />
                      <circle cx={75} cy={75} r={62} fill="none" stroke="var(--border)" strokeWidth={1} />
                    </svg>
                    <div style={{ display: 'flex', gap: 12, marginTop: -8 }}>
                      <span className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)' }} />
                        Idle Fuel
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)' }} />
                        Driving Fuel
                      </span>
                    </div>
                    <span className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>No data for this period</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Drive Time vs Idle Time */}
            <Card className="flex-1">
              <CardContent className="relative pt-4">
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                  Run Time Breakdown
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
                        <Cell fill={CHART_COLORS.primary} />
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [fmtIdleTime(Number(val))]} />
                      <Legend formatter={(name) => <span style={LEGEND_STYLE}>{name}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <svg width={150} height={150} viewBox="0 0 150 150">
                      <circle cx={75} cy={75} r={62} fill="none" stroke="var(--muted)" strokeWidth={25} />
                      <circle cx={75} cy={75} r={62} fill="none" stroke="var(--border)" strokeWidth={1} />
                    </svg>
                    <div style={{ display: 'flex', gap: 12, marginTop: -8 }}>
                      <span className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)' }} />
                        Idle Time
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'color-mix(in oklch, var(--muted-foreground) 30%, transparent)' }} />
                        Drive Time
                      </span>
                    </div>
                    <span className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>No data for this period</span>
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

        {/* RIGHT COLUMN — MONTHLY TABLE (sticky) */}
        <div className="lg:col-span-4" style={{ position: 'sticky', top: 72, alignSelf: 'start' }}>
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="pb-1 pt-2 px-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Monthly Summary
              </CardTitle>
              {showYearToggle && (
                <div className="flex gap-1">
                  {availableYears.map(year => (
                    <Button
                      key={year}
                      size="sm"
                      variant={selectedTableYear === year ? 'default' : 'outline'}
                      className="h-5 px-1.5 text-[10px]"
                      onClick={e => { e.stopPropagation(); onTableYearChange(year); }}
                    >
                      {year}
                    </Button>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-2 py-1 h-auto sticky left-0 bg-muted z-10">Month</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">Miles</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">MPG</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">Total Fuel</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">Drive Fuel</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle Fuel</TableHead>
                    <TableHead className="text-[warning] text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle%</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyMetrics.tableData.map(month => (
                    <TableRow key={month.monthKey} className={month.totalMiles === 0 ? 'opacity-40' : ''}>
                      <TableCell className="font-semibold text-[11px] px-2 py-1 h-auto sticky left-0 bg-background z-10">{month.month}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{month.totalMiles.toLocaleString()}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{month.avgMpg.toFixed(1)}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{month.totalFuel.toLocaleString()}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{month.drivingFuel.toLocaleString()}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{month.idleFuel.toLocaleString()}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums font-semibold" style={{ color: 'var(--warning)' }}>{month.idlePercentage.toFixed(1)}%</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{fmtIdleTime(month.idleTimeMinutes)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/10 border-t-2">
                    <TableCell className="font-bold text-[11px] px-2 py-1 h-auto sticky left-0 bg-primary/10 z-10">Total</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{Math.round(monthlyTableTotals.totalMiles).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{Number(monthlyTableTotals.avgMpg).toFixed(1)}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{Math.round(monthlyTableTotals.totalFuel).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{Math.round(monthlyTableTotals.totalDrivingFuel).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{Math.round(monthlyTableTotals.totalIdleFuel).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{Number(monthlyTableTotals.idlePercentage).toFixed(1)}%</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{fmtIdleTime(monthlyTableTotals.totalIdleTime)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
