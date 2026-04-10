'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUnitData } from '@/features/units/hooks/useUnitData';
import { ChartCard } from '@/features/units/components/ChartCard';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/Skeleton';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vin = params.vin as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'telematics'>('overview');

  const {
    loading, error, unit,
    telematicsData, repairLines, repairJobs,
    damageJobCount, repairCategoryBreakdown, displayRepairs,
    overviewSummary, monthlyMetrics, totals,
    overallAvgMpg, overallIdlePercentage, vsFleet, isDamageRepairLine,
  } = useUnitData(vin);

  const chartTooltipStyle = {
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' },
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6">
        <div className="flex flex-col gap-4 mt-4">
          <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
          <Skeleton style={{ height: 20, width: '25%', borderRadius: 8 }} />
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 100, borderRadius: 8 }} />)}
          </div>
          <Skeleton style={{ height: 300, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          Back to Fleet
        </Button>
        <div className="text-destructive">{error || 'Unit not found'}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          Back to Fleet
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-1">Unit {unit.unitNumber}</h1>
            <div className="flex gap-3 text-muted-foreground text-sm">
              <span className="font-mono">{unit.vin}</span>
              <span>•</span>
              <span>{unit.year} {unit.make} {unit.model}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="repairs">Repairs</TabsTrigger>
          <TabsTrigger value="telematics">Telematics</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Miles (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.totalMiles).toLocaleString()} mi` : '—'}
            />
            <KpiCard
              label="Avg MPG (30d)"
              value={telematicsData.length > 0 ? overviewSummary.avgMpg.toFixed(2) : '—'}
              change={vsFleet?.mpg}
            />
            <KpiCard
              label="Idle Hours (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.idleHours)} hrs` : '—'}
            />
            <KpiCard
              label="Total Fuel (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.totalFuel)} gal` : '—'}
            />
            <KpiCard
              label="Idle Fuel (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.idleFuel)} gal` : '—'}
            />
            <KpiCard label="Total Repair Jobs" value={repairJobs.size} />
            {damageJobCount > 0 && (
              <KpiCard
                label="Damage Jobs"
                value={damageJobCount}
                variant="warning"
                subtext={`${repairJobs.size > 0 ? Math.round((damageJobCount / repairJobs.size) * 100) : 0}% of jobs`}
              />
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Recent Repairs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Date</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">RO #</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Invoice #</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRepairs.slice(0, 5).map(r => (
                    <TableRow key={r.revenue_detail_id}>
                      <TableCell>{new Date(r.invoice_date).toLocaleDateString()}</TableCell>
                      <TableCell>{r.repair_order || 'N/A'}</TableCell>
                      <TableCell>{r.invoice_number || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary">Completed</Badge>
                          {isDamageRepairLine(r) && <Badge variant="destructive">Damage</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {displayRepairs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No recent repairs</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPAIRS TAB */}
        <TabsContent value="repairs" className="flex flex-col gap-6">
          {damageJobCount > 0 && (
            <div className="bg-destructive/5 border border-destructive/25 rounded-lg p-4">
              <h3 className="font-semibold text-destructive mb-2">
                {damageJobCount} of {repairJobs.size} {repairJobs.size === 1 ? 'job' : 'jobs'} flagged as damage
              </h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(
                  repairLines
                    .filter(isDamageRepairLine)
                    .map(l => `${l.component || '?'} / ${l.system || '?'}`)
                )).map(cat => (
                  <span key={cat} className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Date</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Repair Order #</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Invoice #</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Category</TableHead>
                    <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRepairs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No repair history found</TableCell>
                    </TableRow>
                  ) : (
                    displayRepairs.map(r => (
                      <TableRow key={r.revenue_detail_id} className={isDamageRepairLine(r) ? 'bg-destructive/5' : ''}>
                        <TableCell>{new Date(r.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>{r.repair_order || 'N/A'}</TableCell>
                        <TableCell>{r.invoice_number || 'N/A'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.component || r.system ? `${r.component || '?'} / ${r.system || '?'}` : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary">Completed</Badge>
                            {isDamageRepairLine(r) && <Badge variant="destructive">Damage</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {repairCategoryBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Component / System Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[320px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repairCategoryBreakdown} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="category" width={200} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [v as string, 'Line Items'] as [string, string]} />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false} fill="#d9a528">
                      <LabelList dataKey="count" position="right" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TELEMATICS TAB */}
        <TabsContent value="telematics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — CHARTS */}
            <div className="flex flex-col gap-4">
              <ChartCard title="MPG">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip {...chartTooltipStyle} />
                    <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="avgMpg" position="top" offset={10} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Idle %">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="idlePercentage" position="top" offset={10} formatter={(v: unknown) => `${v}%`} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Miles Driven">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="totalMiles" position="top" offset={10} formatter={(v: unknown) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* RIGHT — KPI CARDS + MONTHLY TABLE */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Avg MPG (all time)"
                  value={totals.totalFuel > 0 ? overallAvgMpg : '—'}
                  change={vsFleet?.mpg}
                />
                <KpiCard
                  label="Idle % (all time)"
                  value={telematicsData.length > 0 ? `${overallIdlePercentage}%` : '—'}
                  variant={parseFloat(overallIdlePercentage) > 30 ? 'warning' : 'default'}
                  change={vsFleet?.idlePct}
                />
                <KpiCard
                  label="Total Fuel"
                  value={totals.totalFuel > 0 ? `${Math.round(totals.totalFuel).toLocaleString()} gal` : '—'}
                />
                <KpiCard
                  label="Est. Fuel Cost"
                  value={totals.totalFuel > 0 ? `$${Math.round(totals.totalFuel * 3.50).toLocaleString()}` : '—'}
                />
              </div>

              <Card className="flex flex-col flex-1 overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Monthly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
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
                      {monthlyMetrics.map(month => (
                        <TableRow key={month.monthKey}>
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
                        <TableCell className="font-bold">{overallAvgMpg}</TableCell>
                        <TableCell className="font-bold">{totals.totalMiles.toLocaleString()}</TableCell>
                        <TableCell className="font-bold">{overallIdlePercentage}%</TableCell>
                        <TableCell className="font-bold">{totals.totalIdleFuel.toLocaleString()}</TableCell>
                        <TableCell className="font-bold">{totals.totalIdleTime.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
