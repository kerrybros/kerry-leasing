'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDriverUtilizationQuery, useVehicleUtilizationQuery, useFleetUnitsQuery, useOrgSettingsQuery, useDriverScorecardQuery } from '@/hooks/useDataQueries';
import { Loader2 } from 'lucide-react';
import { computeDriverScore } from '@/lib/driverScore';
import { KpiCard } from '@/components/KpiCard';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
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
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Legend,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE, LEGEND_STYLE } from '@/features/fleet/utils/chartColors';

interface MonthlyDriverMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuelGal: number;
  idleTimeMinutes: number;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[220px] pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

const chartTooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--card-foreground)' },
};

type Period = '30d' | '90d' | '6m' | '1y' | 'all';
const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: '6m', label: '6m', days: 183 },
  { id: '1y', label: '1y', days: 365 },
  { id: 'all', label: 'All' },
];

export default function DriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const driverId = parseInt(params.driverId as string, 10);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('90d');

  const periodDates = useMemo(() => {
    if (selectedPeriod === 'all') return { startDate: undefined, endDate: undefined };
    const p = PERIODS.find(p => p.id === selectedPeriod)!;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - p.days!);
    return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
  }, [selectedPeriod]);

  const periodLabel = selectedPeriod === 'all' ? 'All Time' : PERIODS.find(p => p.id === selectedPeriod)!.label;

  const orgSettingsQuery = useOrgSettingsQuery();
  const canQuery = !!(orgSettingsQuery.data?.tracksDrivers && orgSettingsQuery.data?.telematicsProvider === 'MOTIVE');
  const driverUtilQuery = useDriverUtilizationQuery(canQuery);
  const scorecardQuery = useDriverScorecardQuery(canQuery);
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery();

  const driverRecords = useMemo(() => {
    if (!driverUtilQuery.data) return [];
    const all = driverUtilQuery.data.filter(r => r.driverId === driverId);
    const { startDate, endDate } = periodDates;
    if (!startDate && !endDate) return all;
    return all.filter(r => {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    });
  }, [driverUtilQuery.data, driverId, periodDates]);

  const driverName = useMemo(() => {
    const r = driverRecords[0];
    if (!r) return `Driver ${driverId}`;
    return `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${driverId}`;
  }, [driverRecords, driverId]);

  const fleetAvgMpg = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return undefined;
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    const data = vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
    let totalMiles = 0, totalFuel = 0;
    data.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
    });
    return totalFuel > 0 ? totalMiles / totalFuel : undefined;
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  const kpis = useMemo(() => {
    let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0, totalIdleFuel = 0;
    driverRecords.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
      totalIdleTime += r.idleTime || 0;
      totalDrivingTime += r.drivingTime || 0;
      totalIdleFuel += r.idleFuel || 0;
    });
    const engineOn = totalIdleTime + totalDrivingTime;
    const idlePct = engineOn > 0 ? (totalIdleTime / engineOn) * 100 : 0;
    const driveTimePct = engineOn > 0 ? (totalDrivingTime / engineOn) * 100 : 0;
    const avgMpg = totalFuel > 0 && totalMiles > 0 ? totalMiles / totalFuel : 0;
    const driveTimeHours = totalDrivingTime / 3600;
    const drivingFuelGal = Math.max(0, totalFuel - totalIdleFuel);
    const drivingFuelRatio = totalFuel > 0 ? drivingFuelGal / totalFuel : 1;
    const score = computeDriverScore({ idlePct, mpg: avgMpg, fleetAvgMpg, driveTimePct, drivingFuelRatio });
    const idleTimeHrs = totalIdleTime / 3600;
    const engineTimeHrs = (totalIdleTime + totalDrivingTime) / 3600;
    return { totalMiles, totalFuel, avgMpg, idlePct, totalIdleFuel, driveTimeHours, drivingFuelGal, idleTimeHrs, engineTimeHrs, score };
  }, [driverRecords, fleetAvgMpg]);

  const monthlyMetrics = useMemo((): MonthlyDriverMetrics[] => {
    const map = new Map<string, {
      totalMiles: number; totalFuel: number; totalIdleTime: number;
      totalDrivingTime: number; totalIdleFuel: number;
    }>();
    driverRecords.forEach(r => {
      const key = r.date.substring(0, 7);
      const ex = map.get(key) || { totalMiles: 0, totalFuel: 0, totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0 };
      ex.totalMiles += r.totalDistance || 0;
      ex.totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
      ex.totalIdleTime += r.idleTime || 0;
      ex.totalDrivingTime += r.drivingTime || 0;
      ex.totalIdleFuel += r.idleFuel || 0;
      map.set(key, ex);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, d]) => {
        const [year, month] = key.split('-');
        const label = new Date(parseInt(year), parseInt(month) - 1)
          .toLocaleString('default', { month: 'short', year: '2-digit' });
        const engineOn = d.totalIdleTime + d.totalDrivingTime;
        const idlePct = engineOn > 0 ? (d.totalIdleTime / engineOn) * 100 : 0;
        return {
          month: label, monthKey: key,
          totalMiles: Math.round(d.totalMiles),
          avgMpg: d.totalFuel > 0 ? parseFloat((d.totalMiles / d.totalFuel).toFixed(2)) : 0,
          idlePercentage: parseFloat(idlePct.toFixed(2)),
          idleFuelGal: Math.round(d.totalIdleFuel),
          idleTimeMinutes: Math.round(d.totalIdleTime / 60),
        };
      });
  }, [driverRecords]);

  const hardEvents = useMemo(() => {
    return scorecardQuery.data?.data.find(d => d.driverId === driverId)?.hardEvents ?? null;
  }, [scorecardQuery.data, driverId]);

  const hardEventBreakdown = useMemo(() => {
    const bd = scorecardQuery.data?.data.find(d => d.driverId === driverId)?.hardEventBreakdown;
    if (!bd) return null;
    const total = bd.hardAccels + bd.hardBrakes + bd.hardCorners;
    if (total === 0) return null;
    return bd;
  }, [scorecardQuery.data, driverId]);

  const availableYears = useMemo(() => {
    const years = [...new Set(monthlyMetrics.map(m => parseInt(m.monthKey.substring(0, 4))))].sort((a, b) => a - b);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [monthlyMetrics]);

  const [selectedTableYear, setSelectedTableYear] = useState<number>(() => new Date().getFullYear());

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
      const monthName = new Date(selectedTableYear, i).toLocaleString('default', { month: 'short', year: '2-digit' });
      return dataByMonth.get(monthKey) ?? {
        month: monthName, monthKey,
        totalMiles: 0, avgMpg: 0, idlePercentage: 0, idleFuelGal: 0, idleTimeMinutes: 0,
      };
    });
  }, [monthlyMetrics, selectedTableYear]);

  const yearTotals = useMemo(() => {
    let totalMiles = 0, totalIdleFuel = 0, totalIdleTimeMinutes = 0;
    let fuelSum = 0, idleEngineMinutes = 0, totalEngineMinutes = 0;
    tableMonths.forEach(m => {
      totalMiles += m.totalMiles;
      totalIdleFuel += m.idleFuelGal;
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

  const isLoading = orgSettingsQuery.isLoading || driverUtilQuery.isLoading;
  const isRefetching = driverUtilQuery.isFetching && !driverUtilQuery.isLoading;

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6">
        <Skeleton style={{ height: 32, width: '30%', borderRadius: 8, marginTop: 24 }} />
        <div className="grid grid-cols-5 gap-3 mt-6">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} style={{ height: 90, borderRadius: 8 }} />)}
        </div>
        <Skeleton style={{ height: 250, borderRadius: 8, marginTop: 24 }} />
      </div>
    );
  }

  if (isNaN(driverId) || driverRecords.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6 pt-8">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          Back to Drivers
        </Button>
        <EmptyState
          title="Driver Not Found"
          description="No utilization records found for this driver in the current dataset."
        />
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          Back to Drivers
        </Button>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{driverName}</h1>
            {isRefetching && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating...
              </span>
            )}
          </div>
          {/* Period selector */}
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard label={`Total Miles (${periodLabel})`} value={Math.round(kpis.totalMiles).toLocaleString()} subtext="miles" />
        <KpiCard label={`Avg MPG (${periodLabel})`} value={kpis.avgMpg.toFixed(2)} />
        <KpiCard label="Idle %" value={`${kpis.idlePct.toFixed(2)}%`} variant={kpis.idlePct > 30 ? 'warning' : 'default'} />
        <KpiCard label="Idle Fuel" value={Math.round(kpis.totalIdleFuel).toLocaleString()} subtext="gallons" variant={kpis.totalIdleFuel > 0 ? 'warning' : 'default'} />
        <KpiCard label="Total Fuel" value={Math.round(kpis.totalFuel).toLocaleString()} subtext="gallons" />
        <KpiCard label="Driving Fuel" value={Math.round(kpis.drivingFuelGal).toLocaleString()} subtext="gallons" />
        <KpiCard label="Total Drive Time" value={`${Math.round(kpis.driveTimeHours).toLocaleString()} hrs`} />
        <KpiCard label="Idle Time" value={`${Math.round(kpis.idleTimeHrs).toLocaleString()} hrs`} variant={kpis.idleTimeHrs > 0 ? 'warning' : 'default'} />
        <KpiCard label="Engine Time" value={`${Math.round(kpis.engineTimeHrs).toLocaleString()} hrs`} />
        <KpiCard label="Est. Fuel Cost" value={`$${Math.round(kpis.totalFuel * 3.50).toLocaleString()}`} />
        {hardEvents !== null && (
          <KpiCard
            label="Hard Events"
            value={hardEvents}
            variant={hardEvents > 10 ? 'error' : hardEvents > 5 ? 'warning' : 'default'}
          />
        )}
      </div>

      {/* Fuel & Time Breakdown Pie Charts */}
      {kpis.totalFuel > 0 && (
        <div style={{ display: 'flex', gap: 16 }} className="mb-8">
          {/* Fuel Breakdown */}
          <Card className="flex-1">
            <CardContent className="relative pt-4">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                Fuel Breakdown (gal)
              </div>
              {kpis.totalIdleFuel > 0 || kpis.drivingFuelGal > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Idle Fuel', value: Math.round(kpis.totalIdleFuel) },
                        { name: 'Driving Fuel', value: Math.round(kpis.drivingFuelGal) },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={75}
                      paddingAngle={3} dataKey="value" isAnimationActive={false}
                    >
                      <Cell fill="#ef4444" />
                      <Cell fill={CHART_COLORS.idle} />
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

          {/* Engine Time Breakdown */}
          <Card className="flex-1">
            <CardContent className="relative pt-4">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                Run Time Breakdown (hrs)
              </div>
              {kpis.idleTimeHrs > 0 || kpis.driveTimeHours > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Idle Time', value: Math.round(kpis.idleTimeHrs * 10) / 10 },
                        { name: 'Drive Time', value: Math.round(kpis.driveTimeHours * 10) / 10 },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={75}
                      paddingAngle={3} dataKey="value" isAnimationActive={false}
                    >
                      <Cell fill="#ef4444" />
                      <Cell fill={CHART_COLORS.success} />
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [`${Number(val).toLocaleString()} hrs`]} />
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
      )}

      {/* Monthly Charts + Table */}
      <div className="grid lg:grid-cols-12 gap-6 mb-8">
        {/* Left: Charts */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <ChartCard title="MPG per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={35} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                  <LabelList dataKey="avgMpg" position="top" offset={10} style={{ fill: 'var(--foreground)', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Idle % per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={35} />
                <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`${v}%`, 'Idle %']} />
                <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="idlePercentage" position="top" offset={10} formatter={(v: unknown) => `${v}%`} style={{ fill: 'var(--foreground)', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Miles per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={35} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                  <LabelList dataKey="totalMiles" position="top" offset={10} formatter={(v: unknown) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} style={{ fill: 'var(--foreground)', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Right: Monthly Table */}
        <div className="lg:col-span-4 flex flex-col">
          <Card className="flex flex-col flex-1 overflow-hidden">
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
            <CardContent className="p-0 flex-1 overflow-x-auto">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-2 py-1 h-auto sticky left-0 bg-muted z-10 whitespace-nowrap">Month</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">MPG</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[9px] px-1.5 py-1 h-auto whitespace-nowrap">Miles</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle %</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle Fuel</TableHead>
                    <TableHead className="text-[9px] px-1.5 py-1 h-auto whitespace-nowrap font-semibold" style={{ color: 'var(--warning)' }}>Idle (hr)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableMonths.map(m => (
                    <TableRow key={m.monthKey} className={m.totalMiles === 0 ? 'opacity-40' : ''}>
                      <TableCell className="font-semibold text-[11px] px-2 py-1 h-auto sticky left-0 bg-background z-10">{m.month}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{m.avgMpg > 0 ? m.avgMpg.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums">{m.totalMiles > 0 ? m.totalMiles.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums font-semibold" style={{ color: 'var(--warning)' }}>{m.idlePercentage > 0 ? `${m.idlePercentage.toFixed(1)}%` : '—'}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{m.idleFuelGal > 0 ? m.idleFuelGal.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{m.idleTimeMinutes > 0 ? (m.idleTimeMinutes / 60).toFixed(1) : '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/10 border-t-2">
                    <TableCell className="font-bold text-[11px] px-2 py-1 h-auto sticky left-0 bg-primary/10 z-10">Total</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{yearTotals.avgMpg}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums">{yearTotals.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.idlePct}{yearTotals.idlePct !== '—' ? '%' : ''}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.totalIdleFuel.toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-[11px] px-1.5 py-1 h-auto tabular-nums" style={{ color: 'var(--warning)' }}>{yearTotals.totalIdleTimeMinutes > 0 ? (yearTotals.totalIdleTimeMinutes / 60).toFixed(1) : '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Safety Events Pie Chart + Summary side by side */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* Pie chart — only when breakdown data exists */}
        {hardEventBreakdown && (
          <Card style={{ flex: '0 0 300px' }}>
            <CardContent className="relative pt-4">
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginBottom: 4 }} className="text-muted-foreground">
                Safety Events by Type
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Hard Brakes', value: hardEventBreakdown.hardBrakes },
                      { name: 'Hard Accels', value: hardEventBreakdown.hardAccels },
                      { name: 'Hard Corners', value: hardEventBreakdown.hardCorners },
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={75}
                    paddingAngle={3} dataKey="value" isAnimationActive={false}
                  >
                    <Cell fill="#ef4444" />
                    <Cell fill={CHART_COLORS.idle} />
                    <Cell fill={CHART_COLORS.primary} />
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [`${Number(val)} events`]} />
                  <Legend formatter={(name) => <span style={LEGEND_STYLE}>{name}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Safety Events Section */}
        <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Safety Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hardEvents !== null ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Hard events include hard braking, harsh acceleration, and sudden maneuvers recorded by the telematics provider.
              </p>
              <div className="flex items-center gap-4">
                <div className={`rounded-lg border p-5 text-center min-w-[120px] ${
                  hardEvents > 10 ? 'bg-destructive/10 border-destructive/30' :
                  hardEvents > 5 ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-muted/40 border-border'
                }`}>
                  <div className={`text-3xl font-bold ${
                    hardEvents > 10 ? 'text-destructive' :
                    hardEvents > 5 ? 'text-amber-600 dark:text-amber-400' :
                    'text-foreground'
                  }`}>{hardEvents}</div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Hard Events</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {hardEvents === 0 && 'No hard events recorded for this driver in the selected period.'}
                  {hardEvents > 0 && hardEvents <= 5 && 'Low hard event count — good driving behavior.'}
                  {hardEvents > 5 && hardEvents <= 10 && 'Moderate hard events. Consider a coaching conversation.'}
                  {hardEvents > 10 && 'High hard event count. Safety coaching is recommended.'}
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Safety event data (speeding, hard stops, stop sign violations) is not yet available from the telematics provider.
                This section will populate automatically when the API is connected.
              </p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Speeding Events', value: '—' },
                  { label: 'Hard Stops', value: '—' },
                  { label: 'Stop Sign Violations', value: '—' },
                ].map(item => (
                  <div key={item.label} className="rounded-lg bg-muted/40 border border-border p-4 text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{item.value}</div>
                    <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{item.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
