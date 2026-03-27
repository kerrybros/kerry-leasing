'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDriverUtilizationQuery, useVehicleUtilizationQuery, useFleetUnitsQuery, useOrgSettingsQuery } from '@/hooks/useDataQueries';
import { computeDriverScore, scoreVariant } from '@/lib/driverScore';
import { KpiCard } from '@/components/KpiCard';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
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

const chartStyles = {
  bar: {
    background: 'var(--primary-dark)',
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#fff',
    padding: '0.5rem 1rem',
    borderRadius: '4px 4px 0 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  container: {
    background: 'var(--bg-card)',
    borderRadius: '0 0 4px 4px',
    padding: '0.5rem',
    border: '1px solid var(--border)',
    borderTop: 'none',
    height: '220px',
  }
};

const tableHeaderStyle = {
  background: 'var(--primary-dark)',
  color: 'white',
  position: 'sticky' as const,
  top: 0,
  zIndex: 10,
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
  const vehicleUtilQuery = useVehicleUtilizationQuery(
    orgSettingsQuery.data?.telematicsProvider
  );

  // All records for this driver
  const driverRecords = useMemo(() => {
    if (!driverUtilQuery.data) return [];
    return driverUtilQuery.data.filter(r => r.driverId === driverId);
  }, [driverUtilQuery.data, driverId]);

  // Driver name from first record
  const driverName = useMemo(() => {
    const r = driverRecords[0];
    if (!r) return `Driver ${driverId}`;
    return `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${driverId}`;
  }, [driverRecords, driverId]);

  // Fleet avg MPG for score normalization
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

  // Overall KPI aggregates
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
    return { totalMiles, avgMpg, idlePct, totalIdleFuel, driveTimeHours, score };
  }, [driverRecords, fleetAvgMpg]);

  // Monthly aggregation
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
      <div className="container">
        <Skeleton style={{ height: 32, width: '30%', borderRadius: 8, marginTop: 24 }} />
        <div className="grid grid-cols-5 gap-3 mt-6">
          {[1,2,3,4,5].map(i => <Skeleton key={i} style={{ height: 90, borderRadius: 8 }} />)}
        </div>
        <Skeleton style={{ height: 250, borderRadius: 8, marginTop: 24 }} />
      </div>
    );
  }

  if (isNaN(driverId) || driverRecords.length === 0) {
    return (
      <div className="container" style={{ paddingTop: '2rem' }}>
        <button onClick={() => router.back()} className="btn btn-secondary mb-4">
          Back to Drivers
        </button>
        <EmptyState
          title="Driver Not Found"
          description="No utilization records found for this driver in the current dataset."
        />
      </div>
    );
  }

  const variant = scoreVariant(kpis.score);
  const scoreBadgeClass =
    variant === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
    variant === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-200' :
    'bg-red-100 text-red-800 border-red-200';

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => router.back()} className="btn btn-secondary mb-4" style={{ fontSize: '0.875rem' }}>
          Back to Drivers
        </button>
        <div className="flex items-center gap-4">
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>{driverName}</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-bold border ${scoreBadgeClass}`}>
            Score: {kpis.score}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard
          label="Total Miles"
          value={Math.round(kpis.totalMiles).toLocaleString()}
          subtext="miles"
        />
        <KpiCard
          label="Avg MPG"
          value={kpis.avgMpg.toFixed(2)}
        />
        <KpiCard
          label="Idle %"
          value={`${kpis.idlePct.toFixed(2)}%`}
          variant={kpis.idlePct > 30 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Idle Fuel"
          value={Math.round(kpis.totalIdleFuel).toLocaleString()}
          subtext="gallons"
        />
        <KpiCard
          label="Total Drive Time"
          value={`${Math.round(kpis.driveTimeHours).toLocaleString()} hrs`}
        />
      </div>

      {/* Monthly Charts */}
      <div className="grid lg:grid-cols-12 gap-6 mb-8">
        {/* Left: Charts */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* MPG Chart */}
          <div>
            <div style={chartStyles.bar}>MPG per Month</div>
            <div style={chartStyles.container}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={35} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} />
                  <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="avgMpg" position="top" offset={10} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Idle % Chart */}
          <div>
            <div style={chartStyles.bar}>Idle % per Month</div>
            <div style={chartStyles.container}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={35} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} formatter={(v: unknown) => [`${v}%`, 'Idle %']} />
                  <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="idlePercentage" position="top" offset={10} formatter={(v: any) => `${v}%`} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Miles Chart */}
          <div>
            <div style={chartStyles.bar}>Miles per Month</div>
            <div style={chartStyles.container}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={35} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} />
                  <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="totalMiles" position="top" offset={10} formatter={(v: any) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right: Monthly Summary Table */}
        <div className="lg:col-span-4 flex flex-col">
          <div style={chartStyles.bar}>Monthly Summary</div>
          <div className="table-container flex-1" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', overflowY: 'auto' }}>
            <table className="table">
              <thead style={tableHeaderStyle}>
                <tr>
                  <th style={{ color: 'white' }}>Month</th>
                  <th style={{ color: 'white' }}>MPG</th>
                  <th style={{ color: 'white' }}>Miles</th>
                  <th style={{ color: 'white' }}>Idle %</th>
                </tr>
              </thead>
              <tbody>
                {monthlyMetrics.map(m => (
                  <tr key={m.monthKey}>
                    <td className="font-semibold">{m.month}</td>
                    <td>{m.avgMpg.toFixed(2)}</td>
                    <td>{m.totalMiles.toLocaleString()}</td>
                    <td className="font-semibold">{m.idlePercentage.toFixed(2)}%</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: 700 }}>
                  <td style={{ color: 'white' }}>Total</td>
                  <td style={{ color: 'white' }}>{kpis.avgMpg.toFixed(2)}</td>
                  <td style={{ color: 'white' }}>{Math.round(kpis.totalMiles).toLocaleString()}</td>
                  <td style={{ color: 'white' }}>{kpis.idlePct.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Safety Events Section (structured empty state — no data yet) */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground mb-1">Safety Events</h2>
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
            <div key={item.label} className="rounded-lg bg-muted/30 border border-border p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{item.value}</div>
              <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
