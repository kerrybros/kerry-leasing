'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDriverUtilizationQuery, useVehicleUtilizationQuery, useFleetUnitsQuery, useOrgSettingsQuery } from '@/hooks/useDataQueries';
import { computeDriverScore, scoreVariant } from '@/lib/driverScore';
import { KpiCard } from '@/components/KpiCard';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';

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
  contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' },
};

export default function DriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const driverId = parseInt(params.driverId as string, 10);

  const orgSettingsQuery = useOrgSettingsQuery();
  const driverUtilQuery = useDriverUtilizationQuery(
    orgSettingsQuery.data?.tracksDrivers && orgSettingsQuery.data?.telematicsProvider === 'MOTIVE'
  );
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery();

  const driverRecords = useMemo(() => {
    if (!driverUtilQuery.data) return [];
    return driverUtilQuery.data.filter(r => r.driverId === driverId);
  }, [driverUtilQuery.data, driverId]);

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
    const avgMpg = totalFuel > 0 && totalMiles > 0 ? totalMiles / totalFuel : 0;
    const driveTimeHours = totalDrivingTime / 3600;
    const score = computeDriverScore({ idlePct, mpg: avgMpg, fleetAvgMpg });
    return { totalMiles, totalFuel, avgMpg, idlePct, totalIdleFuel, driveTimeHours, score };
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

  const isLoading = orgSettingsQuery.isLoading || driverUtilQuery.isLoading;

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

  const variant = scoreVariant(kpis.score);
  const badgeVariant: 'default' | 'secondary' | 'destructive' =
    variant === 'success' ? 'default' : variant === 'warning' ? 'secondary' : 'destructive';

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          Back to Drivers
        </Button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">{driverName}</h1>
          <Badge variant={badgeVariant} className="text-sm font-bold px-3 py-1">
            Score: {kpis.score}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard label="Total Miles" value={Math.round(kpis.totalMiles).toLocaleString()} subtext="miles" />
        <KpiCard label="Avg MPG" value={kpis.avgMpg.toFixed(2)} />
        <KpiCard label="Idle %" value={`${kpis.idlePct.toFixed(2)}%`} variant={kpis.idlePct > 30 ? 'warning' : 'default'} />
        <KpiCard label="Idle Fuel" value={Math.round(kpis.totalIdleFuel).toLocaleString()} subtext="gallons" />
        <KpiCard label="Total Fuel" value={Math.round(kpis.totalFuel).toLocaleString()} subtext="gallons" />
        <KpiCard label="Est. Fuel Cost" value={`$${Math.round(kpis.totalFuel * 3.50).toLocaleString()}`} />
        <KpiCard label="Total Drive Time" value={`${Math.round(kpis.driveTimeHours).toLocaleString()} hrs`} />
      </div>

      {/* Monthly Charts + Table */}
      <div className="grid lg:grid-cols-12 gap-6 mb-8">
        {/* Left: Charts */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <ChartCard title="MPG per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={35} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                  <LabelList dataKey="avgMpg" position="top" offset={10} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Idle % per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={35} />
                <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`${v}%`, 'Idle %']} />
                <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="idlePercentage" position="top" offset={10} formatter={(v: unknown) => `${v}%`} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Miles per Month">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={35} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                  <LabelList dataKey="totalMiles" position="top" offset={10} formatter={(v: unknown) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Right: Monthly Table */}
        <div className="lg:col-span-4 flex flex-col">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyMetrics.map(m => (
                    <TableRow key={m.monthKey}>
                      <TableCell className="font-semibold">{m.month}</TableCell>
                      <TableCell>{m.avgMpg.toFixed(2)}</TableCell>
                      <TableCell>{m.totalMiles.toLocaleString()}</TableCell>
                      <TableCell className="font-semibold">{m.idlePercentage.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/10 font-bold border-t-2">
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="font-bold">{kpis.avgMpg.toFixed(2)}</TableCell>
                    <TableCell className="font-bold">{Math.round(kpis.totalMiles).toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{kpis.idlePct.toFixed(2)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Safety Events Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Safety Events
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
