'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
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
import type { UnitMetrics, DriverMetrics, FleetTotals } from './types';

interface TelematicsBreakdownViewProps {
  viewMode: 'unit' | 'driver';
  onViewModeChange: (mode: 'unit' | 'driver') => void;
  tracksDrivers: boolean;
  unitMetrics: UnitMetrics[];
  driverMetrics: DriverMetrics[];
  fleetTotals: FleetTotals;
  selectedId: string | number | null;
  onRowClick: (id: string | number) => void;
  showDriverScorecard: boolean;
}

export function TelematicsBreakdownView({
  viewMode,
  onViewModeChange,
  tracksDrivers,
  unitMetrics,
  driverMetrics,
  fleetTotals,
  selectedId,
  onRowClick,
  showDriverScorecard,
}: TelematicsBreakdownViewProps) {
  const router = useRouter();

  const topIdleUnits = [...unitMetrics]
    .sort((a, b) => parseFloat(b.idlePercentage) - parseFloat(a.idlePercentage))
    .slice(0, 5);

  const topMpgUnits = [...unitMetrics]
    .sort((a, b) => parseFloat(b.avgMpg) - parseFloat(a.avgMpg))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid lg:grid-cols-12 gap-6 h-[600px]">
        {/* LEFT COLUMN — KPI SUMMARY */}
        <div className="lg:col-span-3 flex flex-col gap-4 h-full">
          <Card className="flex flex-col items-center justify-center flex-1">
            <CardContent className="pt-6 text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">Idle %</p>
              <p className="text-4xl font-bold text-amber-500">{fleetTotals.idlePercentage}%</p>
            </CardContent>
          </Card>
          <Card className="flex flex-col items-center justify-center flex-1">
            <CardContent className="pt-6 text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">Idle Fuel</p>
              <p className="text-4xl font-bold text-destructive">{fleetTotals.totalIdleFuel.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">gallons</p>
            </CardContent>
          </Card>
          <Card className="flex flex-col items-center justify-center flex-1">
            <CardContent className="pt-6 text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">Idle Time</p>
              <p className="text-4xl font-bold text-primary">{fleetTotals.totalIdleTime.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">minutes</p>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN — BREAKDOWN TABLE */}
        <div className="lg:col-span-9 flex flex-col h-full">
          <Card className="flex flex-col h-full overflow-hidden">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {viewMode === 'unit' ? 'Unit Breakdown' : 'Driver Breakdown'}
              </CardTitle>
              {tracksDrivers && (
                <div className="flex rounded-md border border-border overflow-hidden">
                  <Button
                    variant={viewMode === 'unit' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none border-0 h-7 px-3 text-xs"
                    onClick={() => onViewModeChange('unit')}
                  >
                    Unit
                  </Button>
                  <Button
                    variant={viewMode === 'driver' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none border-0 border-l border-border h-7 px-3 text-xs"
                    onClick={() => onViewModeChange('driver')}
                  >
                    Driver
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">
                      {viewMode === 'unit' ? 'Unit' : 'Driver'}
                    </TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">MPG</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Miles</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle %</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle Fuel</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle (min)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-primary/10 font-bold border-b-2">
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="font-bold">{fleetTotals.avgMpg}</TableCell>
                    <TableCell className="font-bold">{fleetTotals.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{fleetTotals.idlePercentage}%</TableCell>
                    <TableCell className="font-bold">{fleetTotals.totalIdleFuel.toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{fleetTotals.totalIdleTime.toLocaleString()}</TableCell>
                  </TableRow>
                  {viewMode === 'unit'
                    ? unitMetrics.map(unit => (
                        <TableRow
                          key={unit.vin}
                          onClick={() => onRowClick(unit.vin)}
                          className="cursor-pointer"
                          style={{
                            background: selectedId === unit.vin ? 'hsl(var(--accent))' : undefined,
                            borderLeft: selectedId === unit.vin ? '3px solid hsl(var(--primary))' : '3px solid transparent',
                          }}
                        >
                          <TableCell className="font-semibold">{unit.unitNumber}</TableCell>
                          <TableCell>{unit.avgMpg}</TableCell>
                          <TableCell>{Math.round(unit.totalMiles).toLocaleString()}</TableCell>
                          <TableCell className="font-semibold">{unit.idlePercentage}%</TableCell>
                          <TableCell>{unit.idleFuel.toLocaleString()}</TableCell>
                          <TableCell>{unit.idleTimeMinutes.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    : driverMetrics.map(driver => (
                        <TableRow
                          key={driver.driverId}
                          onClick={() => onRowClick(driver.driverId)}
                          className="cursor-pointer"
                          style={{
                            background: selectedId === driver.driverId ? 'hsl(var(--accent))' : undefined,
                            borderLeft: selectedId === driver.driverId ? '3px solid hsl(var(--primary))' : '3px solid transparent',
                          }}
                        >
                          <TableCell className="font-semibold">{driver.driverName}</TableCell>
                          <TableCell>{driver.avgMpg}</TableCell>
                          <TableCell>{Math.round(driver.totalMiles).toLocaleString()}</TableCell>
                          <TableCell className="font-semibold">{driver.idlePercentage}%</TableCell>
                          <TableCell>{driver.idleFuel.toLocaleString()}</TableCell>
                          <TableCell>{driver.idleTimeMinutes.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top/Bottom Performers */}
      {viewMode === 'unit' && unitMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Worst Idlers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Worst Idlers (Top 5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topIdleUnits} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                    <YAxis
                      type="category"
                      dataKey="unitNumber"
                      width={80}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
                      formatter={(v: unknown) => [`${v}%`, 'Idle %'] as [string, string]}
                    />
                    <Bar
                      dataKey="idlePercentage"
                      fill="#ef4444"
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                      onClick={(data) => {
                        const d = data as { vin?: string };
                        if (d?.vin) router.push(`/app/units/${d.vin}`);
                      }}
                    >
                      <LabelList
                        dataKey="idlePercentage"
                        position="right"
                        formatter={(v: unknown) => `${v}%`}
                        style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Click a bar to view unit detail.</p>
            </CardContent>
          </Card>

          {/* Best MPG */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Best MPG (Top 5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topMpgUnits} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="unitNumber"
                      width={80}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
                      formatter={(v: unknown) => [v as string, 'MPG'] as [string, string]}
                    />
                    <Bar
                      dataKey="avgMpg"
                      fill="#22c55e"
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                      onClick={(data) => {
                        const d = data as { vin?: string };
                        if (d?.vin) router.push(`/app/units/${d.vin}`);
                      }}
                    >
                      <LabelList
                        dataKey="avgMpg"
                        position="right"
                        style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {showDriverScorecard && (
                <div className="mt-2">
                  <Button variant="outline" size="sm" onClick={() => router.push('/app/drivers')}>
                    View Driver Scorecard
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
