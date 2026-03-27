'use client';

import { useOrganization } from '@clerk/nextjs';
import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUnitDetailQuery, useVehicleUtilizationQuery, useFleetUnitsQuery, useOrgSettingsQuery } from '@/hooks/useDataQueries';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';

type RepairLine = {
  revenue_detail_id: string;
  invoice_date: string;
  invoice_number: string | null;
  repair_order: string | null;
  line_code: string | null;
  parts_description: string | null;
  labor_description: string | null;
  component?: string | null;
  system?: string | null;
  line_amt: number | null;
  tax_amt: number | null;
  customer: string | null;
};

function isDamageRepairLine(line: RepairLine): boolean {
  return (
    (line.component ?? '').toLowerCase().includes('damage') ||
    (line.system ?? '').toLowerCase().includes('damage')
  );
}

interface MonthlyMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuel: number;
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
    padding: '1rem',
    border: '1px solid var(--border)',
    borderTop: 'none',
    height: '300px',
  }
};

const tableHeaderStyle = {
  background: 'var(--primary-dark)',
  color: 'white',
  position: 'sticky' as const,
  top: 0,
  zIndex: 10,
};

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useOrganization();
  const vin = params.vin as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'telematics'>('overview');

  // Queries
  const unitQuery = useUnitDetailQuery(vin);
  const orgSettingsQuery = useOrgSettingsQuery();
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery(orgSettingsQuery.data?.telematicsProvider);

  const loading = unitQuery.isLoading;
  const error = (unitQuery.error as Error | null)?.message ?? null;
  const unitData = unitQuery.data;

  // Build unit info
  const unit = useMemo(() => {
    if (!unitData) return null;
    return {
      vin,
      unitNumber:
        unitData.unitInfo?.unitNumber ||
        unitData.servicePlan.repairUnitNumber ||
        vin.slice(-6),
      make: unitData.unitInfo?.make ?? null,
      model: unitData.unitInfo?.model ?? null,
      year: unitData.unitInfo?.year ?? null,
      customerName: organization?.name ?? null,
    };
  }, [unitData, vin, organization?.name]);

  const telematicsData = useMemo(() => unitData?.telematics.history ?? [], [unitData]);
  const repairLines: RepairLine[] = useMemo(() => unitData?.repairs.history ?? [], [unitData]);

  // --- Damage detection ---
  const damageLineIds = useMemo(() => {
    const ids = new Set<string>();
    repairLines.forEach(l => {
      if (isDamageRepairLine(l)) ids.add(l.revenue_detail_id);
    });
    return ids;
  }, [repairLines]);

  // Group repair lines by repair order to count jobs
  const repairJobs = useMemo(() => {
    const map = new Map<string, RepairLine[]>();
    repairLines.forEach(l => {
      const key = l.repair_order || l.invoice_number || l.revenue_detail_id;
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    });
    return map;
  }, [repairLines]);

  const damageJobCount = useMemo(() => {
    let count = 0;
    repairJobs.forEach(lines => {
      if (lines.some(l => isDamageRepairLine(l))) count++;
    });
    return count;
  }, [repairJobs]);

  // Component/system breakdown for this unit
  const repairCategoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; isDamage: boolean }>();
    repairLines.forEach(l => {
      if (!l.component && !l.system) return;
      const key = `${l.component || '?'} / ${l.system || '?'}`;
      const existing = map.get(key) || { count: 0, isDamage: false };
      existing.count += 1;
      if (isDamageRepairLine(l)) existing.isDamage = true;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([category, { count, isDamage }]) => ({ category, count, isDamage }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [repairLines]);

  // Deduplicated repair rows for display (one per repair order)
  const displayRepairs = useMemo(() => {
    const seen = new Set<string>();
    return repairLines
      .filter(l => {
        const key = l.repair_order || l.invoice_number || l.revenue_detail_id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
  }, [repairLines]);

  // --- Overview Summary (Last 30 Days) ---
  const overviewSummary = useMemo(() => {
    const today = new Date();
    const cutOff = new Date();
    cutOff.setDate(today.getDate() - 30);
    const cutOffDate = cutOff.toISOString().split('T')[0];
    const recent = telematicsData.filter(d => d.date >= cutOffDate);
    const totalMiles = recent.reduce((s, d) => s + (d.totalDistance || 0), 0);
    const totalIdleTime = recent.reduce((s, d) => s + (d.idleTime || 0), 0);
    const totalFuel = recent.reduce((s, d) => s + (d.totalFuel || 0), 0);
    const avgMpg = totalFuel > 0 ? totalMiles / totalFuel : 0;
    const idleHours = totalIdleTime / 3600;
    return { totalMiles, avgMpg, idleHours };
  }, [telematicsData]);

  // --- Monthly Metrics for Telematics Tab ---
  const monthlyMetrics = useMemo((): MonthlyMetrics[] => {
    const monthlyMap = new Map<string, {
      totalMiles: number; totalIdleTime: number; totalFuel: number;
      totalIdleFuel: number; totalDrivingTime: number; days: number;
    }>();
    telematicsData.forEach(record => {
      const monthKey = record.date.substring(0, 7);
      const existing = monthlyMap.get(monthKey) || {
        totalMiles: 0, totalIdleTime: 0, totalFuel: 0,
        totalIdleFuel: 0, totalDrivingTime: 0, days: 0,
      };
      existing.totalMiles += record.totalDistance || 0;
      existing.totalIdleTime += record.idleTime || 0;
      existing.totalDrivingTime += record.drivingTime || 0;
      existing.totalFuel += record.totalFuel || 0;
      existing.totalIdleFuel += record.idleFuel || 0;
      existing.days += 1;
      monthlyMap.set(monthKey, existing);
    });
    return Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
        const engineOn = data.totalIdleTime + data.totalDrivingTime;
        return {
          month: monthName, monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: engineOn > 0 ? parseFloat(((data.totalIdleTime / engineOn) * 100).toFixed(2)) : 0,
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      });
  }, [telematicsData]);

  const totals = useMemo(() => {
    return monthlyMetrics.reduce((acc, m) => ({
      totalMiles: acc.totalMiles + m.totalMiles,
      totalIdleFuel: acc.totalIdleFuel + m.idleFuel,
      totalIdleTime: acc.totalIdleTime + m.idleTimeMinutes,
      totalFuel: acc.totalFuel + (m.totalMiles / (m.avgMpg || 1)),
    }), { totalMiles: 0, totalIdleFuel: 0, totalIdleTime: 0, totalFuel: 0 });
  }, [monthlyMetrics]);

  const overallAvgMpg = totals.totalFuel > 0 ? (totals.totalMiles / totals.totalFuel).toFixed(2) : '0.00';
  const overallIdlePercentage = telematicsData.length > 0
    ? ((totals.totalIdleTime * 60) / (telematicsData.length * 86400) * 100).toFixed(2)
    : '0.00';

  // --- vs. Fleet Average ---
  const fleetAvg = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return null;
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    const fleetData = vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin) && v.vin !== vin);
    if (fleetData.length === 0) return null;
    let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0;
    fleetData.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
      totalIdleTime += r.idleTime || 0;
      totalDrivingTime += r.drivingTime || 0;
    });
    const engineOn = totalIdleTime + totalDrivingTime;
    return {
      avgMpg: totalFuel > 0 ? totalMiles / totalFuel : 0,
      idlePct: engineOn > 0 ? (totalIdleTime / engineOn) * 100 : 0,
    };
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data, vin]);

  // vs-fleet-average change indicators
  const vsFleet = useMemo(() => {
    if (!fleetAvg) return null;
    const unitMpgDiff = overviewSummary.avgMpg - fleetAvg.avgMpg;
    const unitIdlePct = parseFloat(overallIdlePercentage);
    const unitIdleDiff = unitIdlePct - fleetAvg.idlePct;
    return {
      mpg: {
        value: `${unitMpgDiff >= 0 ? '+' : ''}${unitMpgDiff.toFixed(2)} vs fleet avg`,
        positive: unitMpgDiff >= 0,
      },
      idlePct: {
        value: `${unitIdleDiff >= 0 ? '+' : ''}${unitIdleDiff.toFixed(2)}% vs fleet avg`,
        positive: unitIdleDiff <= 0, // lower idle is better
      },
    };
  }, [fleetAvg, overviewSummary.avgMpg, overallIdlePercentage]);

  if (loading) {
    return (
      <div className="container">
        <div className="flex flex-col gap-4 mt-4">
          <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
          <Skeleton style={{ height: 20, width: '25%', borderRadius: 8 }} />
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[1,2,3].map(i => <Skeleton key={i} style={{ height: 100, borderRadius: 8 }} />)}
          </div>
          <Skeleton style={{ height: 300, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="container">
        <button onClick={() => router.back()} className="btn btn-secondary mb-4">
          Back to Fleet
        </button>
        <div className="error">{error || 'Unit not found'}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => router.back()} className="btn btn-secondary mb-4" style={{ fontSize: '0.875rem' }}>
          Back to Fleet
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              Unit {unit.unitNumber}
            </h1>
            <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)' }}>
              <span className="font-mono">{unit.vin}</span>
              <span>•</span>
              <span>{unit.year} {unit.make} {unit.model}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {(['overview', 'repairs', 'telematics'] as const).map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1.5rem' }}>
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
              label="Total Repair Jobs"
              value={repairJobs.size}
            />
            {damageJobCount > 0 && (
              <KpiCard
                label="Damage Jobs"
                value={damageJobCount}
                variant="warning"
                subtext={`${repairJobs.size > 0 ? Math.round((damageJobCount / repairJobs.size) * 100) : 0}% of jobs`}
              />
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: '600' }}>Recent Repairs</h3>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border)' }}>
                    <th>Date</th>
                    <th>RO #</th>
                    <th>Invoice #</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRepairs.slice(0, 5).map(r => (
                    <tr key={r.revenue_detail_id}>
                      <td>{new Date(r.invoice_date).toLocaleDateString()}</td>
                      <td>{r.repair_order || 'N/A'}</td>
                      <td>{r.invoice_number || 'N/A'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="badge badge-gray">Completed</span>
                          {isDamageRepairLine(r) && <Badge variant="destructive">Damage</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {displayRepairs.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>No recent repairs</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'repairs' && (
        <div className="flex flex-col gap-6">
          {/* Damage Summary Card */}
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

          {/* Full Repair Table */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr style={{ background: 'var(--primary-dark)', color: 'white' }}>
                  <th style={{ color: 'white' }}>Date</th>
                  <th style={{ color: 'white' }}>Repair Order #</th>
                  <th style={{ color: 'white' }}>Invoice #</th>
                  <th style={{ color: 'white' }}>Category</th>
                  <th style={{ color: 'white' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayRepairs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      No repair history found
                    </td>
                  </tr>
                ) : (
                  displayRepairs.map(r => (
                    <tr key={r.revenue_detail_id}
                      className={isDamageRepairLine(r) ? 'bg-destructive/5' : ''}>
                      <td>{new Date(r.invoice_date).toLocaleDateString()}</td>
                      <td>{r.repair_order || 'N/A'}</td>
                      <td>{r.invoice_number || 'N/A'}</td>
                      <td className="text-xs text-muted-foreground">
                        {r.component || r.system
                          ? `${r.component || '?'} / ${r.system || '?'}`
                          : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="badge badge-gray">Completed</span>
                          {isDamageRepairLine(r) && <Badge variant="destructive">Damage</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Component/System Breakdown Chart */}
          {repairCategoryBreakdown.length > 0 && (
            <div className="bg-bg-card border border-border rounded shadow-sm overflow-hidden">
              <div style={chartStyles.bar}>Component / System Breakdown</div>
              <div style={{ padding: '1rem', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repairCategoryBreakdown} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="category" width={200} stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} formatter={(v: any) => [v, 'Line Items']} />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false} fill="#d9a528">
                      <LabelList dataKey="count" position="right" style={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'telematics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* LEFT COLUMN - CHARTS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* MPG Chart */}
            <div>
              <div style={chartStyles.bar}>MPG</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                    <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="avgMpg" position="top" offset={10} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Idle % Chart */}
            <div>
              <div style={chartStyles.bar}>Idle %</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                    <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="idlePercentage" position="top" offset={10} formatter={(v: any) => `${v}%`} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Miles Driven Chart */}
            <div>
              <div style={chartStyles.bar}>Miles Driven</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                    <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={4} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                      <LabelList dataKey="totalMiles" position="top" offset={10} formatter={(v: any) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - TABLES + KPI CARDS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* vs. Fleet Average KPI Cards */}
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
            </div>

            {/* Monthly Summary Table */}
            <div>
              <div style={chartStyles.bar}>Monthly Summary</div>
              <div className="table-container" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
                <table className="table">
                  <thead style={tableHeaderStyle}>
                    <tr>
                      <th style={{ color: 'white' }}>Month</th>
                      <th style={{ color: 'white' }}>MPG</th>
                      <th style={{ color: 'white' }}>Miles</th>
                      <th style={{ color: 'white' }}>Idle %</th>
                      <th style={{ color: 'white' }}>Idle Fuel</th>
                      <th style={{ color: 'white' }}>Idle (mins)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMetrics.map(month => (
                      <tr key={month.monthKey}>
                        <td style={{ fontWeight: '600' }}>{month.month}</td>
                        <td>{month.avgMpg.toFixed(2)}</td>
                        <td>{month.totalMiles.toLocaleString()}</td>
                        <td style={{ fontWeight: '600' }}>{month.idlePercentage.toFixed(2)}%</td>
                        <td>{month.idleFuel.toLocaleString()}</td>
                        <td>{month.idleTimeMinutes.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: '700' }}>
                      <td style={{ color: 'white' }}>Total</td>
                      <td style={{ color: 'white' }}>{overallAvgMpg}</td>
                      <td style={{ color: 'white' }}>{totals.totalMiles.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{overallIdlePercentage}%</td>
                      <td style={{ color: 'white' }}>{totals.totalIdleFuel.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{totals.totalIdleTime.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
