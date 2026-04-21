'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUnitData } from '@/features/units/hooks/useUnitData';
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
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeft, Loader2, Gauge, Clock, AlertTriangle, Hash } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Legend,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE, LEGEND_STYLE } from '@/features/fleet/utils/chartColors';

type TabId = 'overview' | 'repairs' | 'telematics';
type Period = '30d' | '90d' | '6m' | '1y' | 'all';

const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: '6m', label: '6m', days: 183 },
  { id: '1y', label: '1y', days: 365 },
  { id: 'all', label: 'All' },
];

function periodToDates(period: Period): { startDate?: string; endDate?: string } {
  if (period === 'all') return {};
  const p = PERIODS.find(p => p.id === period)!;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - p.days!);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vin = decodeURIComponent(params.unitNumber as string);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('90d');
  const [selectedTableYear, setSelectedTableYear] = useState<number>(() => new Date().getFullYear());

  const { startDate, endDate } = useMemo(() => periodToDates(selectedPeriod), [selectedPeriod]);

  const {
    loading, isRefetching, error, unit,
    telematicsData, repairLines, repairJobs,
    damageJobCount, repairCategoryBreakdown, displayRepairs,
    overviewSummary, monthlyMetrics, totals,
    overallAvgMpg, overallIdlePercentage, vsFleet, isDamageRepairLine,
    liveStats, safetyEvents,
  } = useUnitData(vin, startDate, endDate);

  const periodLabel = selectedPeriod === 'all' ? 'All Time' : PERIODS.find(p => p.id === selectedPeriod)!.label;

  const availableYears = useMemo(() => {
    const years = [...new Set(monthlyMetrics.map(m => parseInt(m.monthKey.substring(0, 4))))].sort((a, b) => a - b);
    return years;
  }, [monthlyMetrics]);

  const tableMonths = useMemo(() => {
    const yearStr = selectedTableYear.toString();
    const dataByMonth = new Map(
      monthlyMetrics
        .filter(m => m.monthKey.startsWith(yearStr))
        .map(m => [m.monthKey, m])
    );
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, '0');
      const monthKey = `${yearStr}-${monthNum}`;
      const monthName = new Date(selectedTableYear, i).toLocaleString('default', { month: 'long' });
      return dataByMonth.get(monthKey) ?? {
        month: monthName, monthKey,
        totalMiles: 0, avgMpg: 0, idlePercentage: 0, idleFuel: 0, idleTimeMinutes: 0,
      };
    });
  }, [monthlyMetrics, selectedTableYear]);

  const yearTotals = useMemo(() => {
    let totalMiles = 0, totalIdleFuel = 0, totalIdleTimeMinutes = 0;
    let fuelSum = 0, idleEngineMinutes = 0, totalEngineMinutes = 0;
    tableMonths.forEach(m => {
      totalMiles += m.totalMiles;
      totalIdleFuel += m.idleFuel;
      totalIdleTimeMinutes += m.idleTimeMinutes;
      if (m.avgMpg > 0) fuelSum += m.totalMiles / m.avgMpg;
      if (m.idlePercentage > 0) {
        const engineMins = m.idleTimeMinutes / (m.idlePercentage / 100);
        idleEngineMinutes += m.idleTimeMinutes;
        totalEngineMinutes += engineMins;
      }
    });
    const avgMpg = fuelSum > 0 ? (totalMiles / fuelSum).toFixed(2) : '—';
    const idlePct = totalEngineMinutes > 0 ? ((idleEngineMinutes / totalEngineMinutes) * 100).toFixed(1) : '—';
    return { totalMiles, totalIdleFuel, totalIdleTimeMinutes, avgMpg, idlePct };
  }, [tableMonths]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-4">
        <Skeleton style={{ height: 24, width: 120, borderRadius: 6 }} />
        <Skeleton style={{ height: 36, width: '45%', borderRadius: 8 }} />
        <Skeleton style={{ height: 20, width: '30%', borderRadius: 6 }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {[1,2,3,4].map(i => <Skeleton key={i} style={{ height: 90, borderRadius: 8 }} />)}
        </div>
        <Skeleton style={{ height: 300, borderRadius: 8 }} />
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/app/fleet')} className="mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Fleet
        </Button>
        <div className="text-destructive">{error || 'Unit not found'}</div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'repairs', label: `Repairs${repairJobs.size > 0 ? ` (${repairJobs.size})` : ''}` },
    { id: 'telematics', label: 'Telematics' },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-3">
          <button
            onClick={() => router.push('/app/fleet')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Fleet
          </button>

          {/* Row 1: title + period selector */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-none">Unit {unit.unitNumber}</h1>
              {isRefetching && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriod(p.id)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors border ${
                    selectedPeriod === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: subtitle + data chips */}
          <div className="flex items-center justify-between gap-4 mt-0.5">
            <p className="text-sm text-muted-foreground">
              {[unit.year, unit.make, unit.model].filter(Boolean).join(' ')}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {unit.vin && (
                <div className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  <span className="font-semibold text-foreground font-mono">{unit.vin}</span>
                </div>
              )}
              {liveStats?.odometerMiles != null && (
                <div className="flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  <span className="font-semibold text-foreground">{liveStats.odometerMiles.toLocaleString()}</span>
                  <span>mi</span>
                </div>
              )}
              {liveStats?.engineHours != null && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span className="font-semibold text-foreground">{liveStats.engineHours.toLocaleString()}</span>
                  <span>hrs</span>
                </div>
              )}
              {liveStats?.capturedAt && (liveStats.odometerMiles != null || liveStats.engineHours != null) && (
                <span className="opacity-60">as of {new Date(liveStats.capturedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex gap-0 mt-3 -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-[1200px] mx-auto px-6 py-6 w-full flex flex-col gap-6">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label={`Total Miles (${periodLabel})`}
                value={telematicsData.length > 0 ? `${Math.round(overviewSummary.totalMiles).toLocaleString()} mi` : '—'}
              />
              <KpiCard
                label={`Avg MPG (${periodLabel})`}
                value={telematicsData.length > 0 ? overviewSummary.avgMpg.toFixed(2) : '—'}
                change={vsFleet?.mpg}
              />
              <KpiCard
                label={`Idle Hours (${periodLabel})`}
                value={telematicsData.length > 0 ? `${Math.round(overviewSummary.idleHours)} hrs` : '—'}
              />
              <KpiCard
                label={`Total Fuel (${periodLabel})`}
                value={telematicsData.length > 0 ? `${Math.round(overviewSummary.totalFuel)} gal` : '—'}
              />
              <KpiCard
                label={`Idle Fuel (${periodLabel})`}
                value={telematicsData.length > 0 ? `${Math.round(overviewSummary.idleFuel)} gal` : '—'}
                variant={overviewSummary.idleFuel > 0 ? 'warning' : 'default'}
              />
              <KpiCard label="Total Repair Jobs" value={repairJobs.size || '—'} />
              {damageJobCount > 0 && (
                <KpiCard
                  label="Damage Jobs"
                  value={damageJobCount}
                  variant="warning"
                  subtext={`${repairJobs.size > 0 ? Math.round((damageJobCount / repairJobs.size) * 100) : 0}% of jobs`}
                />
              )}
            </div>

            {/* Recent Repairs */}
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Repairs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>RO #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRepairs.slice(0, 5).map(r => (
                      <TableRow key={r.revenue_detail_id}>
                        <TableCell className="pl-4 text-sm">{new Date(r.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm">{r.repair_order || '—'}</TableCell>
                        <TableCell className="text-sm">{r.invoice_number || '—'}</TableCell>
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
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8 text-sm">
                          No repair history found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Safety Events */}
            {safetyEvents.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Safety Events <span className="font-normal normal-case text-muted-foreground">({periodLabel})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* Monthly badge strip */}
                  {(() => {
                    const byMonth = new Map<string, { total: number; high: number; medium: number }>();
                    safetyEvents.forEach(e => {
                      const m = e.eventDate.substring(0, 7);
                      const cur = byMonth.get(m) ?? { total: 0, high: 0, medium: 0 };
                      cur.total++;
                      if (e.severity === 'high') cur.high++;
                      else if (e.severity === 'medium') cur.medium++;
                      byMonth.set(m, cur);
                    });
                    return (
                      <div className="flex flex-wrap gap-2">
                        {Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([month, counts]) => (
                          <div key={month} className="px-3 py-2 bg-muted rounded-lg text-sm">
                            <div className="font-medium">{new Date(month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {counts.total} events
                              {counts.high > 0 && <span className="ml-1.5 text-destructive font-medium">{counts.high} high</span>}
                              {counts.medium > 0 && <span className="ml-1.5 text-amber-500 font-medium">{counts.medium} med</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Driver</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safetyEvents.slice(0, 10).map(e => (
                        <TableRow key={e.samsaraId}>
                          <TableCell className="text-sm">{new Date(e.eventDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-sm capitalize">{e.behaviorLabel.replace(/([A-Z])/g, ' $1').trim()}</TableCell>
                          <TableCell>
                            {e.severity === 'high' && <Badge variant="destructive">High</Badge>}
                            {e.severity === 'medium' && <Badge className="bg-amber-500 hover:bg-amber-500">Medium</Badge>}
                            {(!e.severity || e.severity === 'low') && <Badge variant="secondary">Low</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.driverName || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── REPAIRS TAB ── */}
        {activeTab === 'repairs' && (
          <>
            {damageJobCount > 0 && (
              <div className="flex items-start gap-3 bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    {damageJobCount} of {repairJobs.size} {repairJobs.size === 1 ? 'job' : 'jobs'} flagged for damage
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.from(new Set(
                      repairLines.filter(isDamageRepairLine).map(l => `${l.component || '?'} / ${l.system || '?'}`)
                    )).map(cat => (
                      <span key={cat} className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Repair Order #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRepairs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">
                          No repair history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayRepairs.map(r => (
                        <TableRow key={r.revenue_detail_id} className={isDamageRepairLine(r) ? 'bg-destructive/5' : ''}>
                          <TableCell className="pl-4 text-sm">{new Date(r.invoice_date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-sm">{r.repair_order || '—'}</TableCell>
                          <TableCell className="text-sm">{r.invoice_number || '—'}</TableCell>
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
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Bar chart — existing */}
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Component / System Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={repairCategoryBreakdown} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                          <XAxis type="number" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="category" width={200} stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: CHART_COLORS.tick }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [v as string, 'Line Items'] as [string, string]} />
                          <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false} fill={CHART_COLORS.primary}>
                            <LabelList dataKey="count" position="right" style={{ fill: 'var(--foreground)', fontSize: 11 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Pie chart — new */}
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Repair Mix (Top Categories)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-0">
                      {(() => {
                        const PIE_COLORS = ['#6366f1','#f59e0b','#22c55e','#3b82f6','#ef4444','#8b5cf6','#14b8a6','#f97316'];
                        const pieData = repairCategoryBreakdown.slice(0, 8).map((r, i) => ({
                          name: r.category.length > 22 ? r.category.substring(0, 22) + '…' : r.category,
                          fullName: r.category,
                          value: r.count,
                          color: r.isDamage ? '#ef4444' : PIE_COLORS[i % PIE_COLORS.length],
                        }));
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieData} cx="50%" cy="42%" innerRadius={50} outerRadius={80} dataKey="value" isAnimationActive={false} paddingAngle={2}>
                                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Pie>
                              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, _name, props) => [
                                `${v} line items`,
                                (props.payload as { fullName: string }).fullName,
                              ]} />
                              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </>
        )}

        {/* ── TELEMATICS TAB ── */}
        {activeTab === 'telematics' && (
          <>
            {/* KPI strip */}
            {(() => {
              const drivingFuel = Math.max(0, totals.totalFuel - totals.totalIdleFuel);
              const driveTimeHrs = Math.round(totals.totalDrivingTimeSec / 3600);
              const idleTimeHrs = Math.round(totals.totalIdleTimeSec / 3600);
              const idlePct = parseFloat(overallIdlePercentage);
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard
                    label={`Avg MPG (${periodLabel})`}
                    value={totals.totalFuel > 0 ? overallAvgMpg : '—'}
                    change={vsFleet?.mpg}
                  />
                  <KpiCard
                    label={`Idle % (${periodLabel})`}
                    value={telematicsData.length > 0 ? `${overallIdlePercentage}%` : '—'}
                    variant={idlePct > 30 ? 'warning' : 'default'}
                    change={vsFleet?.idlePct}
                  />
                  <KpiCard
                    label="Total Miles"
                    value={totals.totalMiles > 0 ? `${totals.totalMiles.toLocaleString()} mi` : '—'}
                  />
                  <KpiCard
                    label="Total Fuel"
                    value={totals.totalFuel > 0 ? `${Math.round(totals.totalFuel).toLocaleString()} gal` : '—'}
                  />
                  <KpiCard
                    label="Idle Fuel"
                    value={totals.totalIdleFuel > 0 ? `${totals.totalIdleFuel.toLocaleString()} gal` : '—'}
                    variant={totals.totalIdleFuel > 0 ? 'warning' : 'default'}
                  />
                  <KpiCard
                    label="Driving Fuel"
                    value={drivingFuel > 0 ? `${Math.round(drivingFuel).toLocaleString()} gal` : '—'}
                  />
                  <KpiCard
                    label="Drive Time"
                    value={driveTimeHrs > 0 ? `${driveTimeHrs.toLocaleString()} hrs` : '—'}
                  />
                  <KpiCard
                    label="Idle Time"
                    value={idleTimeHrs > 0 ? `${idleTimeHrs.toLocaleString()} hrs` : '—'}
                    variant={idleTimeHrs > 0 ? 'warning' : 'default'}
                  />

                </div>
              );
            })()}

            {/* Fuel & Time Split Pie Charts */}
            {telematicsData.length > 0 && (() => {
              const drivingFuel = Math.max(0, totals.totalFuel - totals.totalIdleFuel);
              const driveTimeSec = totals.totalDrivingTimeSec;
              const idleTimeSec = totals.totalIdleTimeSec;
              return (
                <div style={{ display: 'flex', gap: 16 }}>
                  {/* Fuel Breakdown */}
                  <Card className="flex-1">
                    <CardContent className="relative pt-4">
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                        Fuel Breakdown (gal)
                      </div>
                      {totals.totalIdleFuel > 0 || drivingFuel > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Idle Fuel', value: Math.round(totals.totalIdleFuel) },
                                { name: 'Driving Fuel', value: Math.round(drivingFuel) },
                              ]}
                              cx="50%" cy="50%"
                              innerRadius={50} outerRadius={75}
                              paddingAngle={3} dataKey="value" isAnimationActive={false}
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
                          <span className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>No data for this period</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                </div>
              );
            })()}

            {/* Charts + Monthly summary side by side */}
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Charts — left 3/5 */}
              <div className="lg:col-span-3 flex flex-col gap-4">
                {[
                  { title: 'MPG', dataKey: 'avgMpg', fmt: (v: unknown) => `${v}` },
                  { title: 'Idle %', dataKey: 'idlePercentage', fmt: (v: unknown) => `${v}%` },
                  { title: 'Miles Driven', dataKey: 'totalMiles', fmt: (v: unknown) => typeof v === 'number' && v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v) },
                ].map(({ title, dataKey, fmt }) => (
                  <Card key={title}>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[180px] pt-0 px-2 pb-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                          <XAxis dataKey="month" stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={35} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Line type="monotone" dataKey={dataKey} stroke={CHART_COLORS.primary} strokeWidth={3} dot={{ fill: CHART_COLORS.primary, r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                            <LabelList dataKey={dataKey} position="top" offset={8} formatter={fmt} style={{ fill: 'var(--foreground)', fontSize: 10, fontWeight: 600 }} />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Monthly Summary — right 2/5 */}
              <div className="lg:col-span-2">
                <Card className="h-full flex flex-col overflow-hidden">
                  <CardHeader className="pb-1 pt-2 px-3 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Monthly Summary
                    </CardTitle>
                    {availableYears.length > 1 && (
                      <div className="flex gap-1">
                        {availableYears.map(year => (
                          <Button
                            key={year}
                            size="sm"
                            variant={selectedTableYear === year ? 'default' : 'outline'}
                            className="h-5 px-1.5 text-[10px]"
                            onClick={() => setSelectedTableYear(year)}
                          >
                            {year}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto flex-1">
                    <Table className="text-[11px]">
                      <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted">
                          <TableHead className="pl-3 text-[9px] font-medium text-muted-foreground py-1 h-auto sticky left-0 bg-muted z-10">Month</TableHead>
                          <TableHead className="text-[9px] font-medium text-muted-foreground px-1.5 py-1 h-auto whitespace-nowrap">MPG</TableHead>
                          <TableHead className="text-[9px] font-medium text-muted-foreground px-1.5 py-1 h-auto whitespace-nowrap">Miles</TableHead>
                          <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle%</TableHead>
                          <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle Gal</TableHead>
                          <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableMonths.map(m => (
                          <TableRow key={m.monthKey} className={m.totalMiles === 0 ? 'opacity-40' : ''}>
                            <TableCell className="pl-3 font-semibold text-[11px] px-2 py-1 h-auto sticky left-0 bg-background z-10">{m.month}</TableCell>
                            <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{m.avgMpg.toFixed(2)}</TableCell>
                            <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{m.totalMiles.toLocaleString()}</TableCell>
                            <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums font-semibold" style={{ color: 'var(--warning)' }}>{m.idlePercentage.toFixed(1)}%</TableCell>
                            <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{m.idleFuel.toLocaleString()}</TableCell>
                            <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{m.idleTimeMinutes.toLocaleString()}m</TableCell>
                          </TableRow>
                        ))}
                        {tableMonths.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">
                              No data for {selectedTableYear}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className="bg-primary/10 border-t-2">
                          <TableCell className="pl-3 font-bold text-[11px] px-2 py-1 h-auto sticky left-0 bg-primary/10 z-10">Total</TableCell>
                          <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{yearTotals.avgMpg}</TableCell>
                          <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{yearTotals.totalMiles.toLocaleString()}</TableCell>
                          <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.idlePct}{yearTotals.idlePct !== '—' ? '%' : ''}</TableCell>
                          <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.totalIdleFuel.toLocaleString()}</TableCell>
                          <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.totalIdleTimeMinutes.toLocaleString()}m</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
