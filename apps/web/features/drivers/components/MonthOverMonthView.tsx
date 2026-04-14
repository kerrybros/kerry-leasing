'use client';

import { useMemo, useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { EmptyState } from '@/components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MonthlyDriverData, WeeklyDriverData } from '@/features/drivers/hooks/useDriversData';
import type { DriverRow } from '@/features/drivers/types';

const KPI_OPTIONS = [
  { id: 'score' as const,              label: 'Score' },
  { id: 'avgMpg' as const,             label: 'MPG' },
  { id: 'idlePct' as const,            label: 'Idle %' },
  { id: 'driveTimeHrs' as const,       label: 'Drive (hrs)' },
  { id: 'idleTimeHrs' as const,        label: 'Idle (hrs)' },
  { id: 'totalMiles' as const,         label: 'Miles' },
  { id: 'totalFuelGal' as const,       label: 'Total Fuel' },
  { id: 'idleFuelGal' as const,        label: 'Idle Fuel' },
  { id: 'estimatedFuelCost' as const,  label: 'Fuel Cost ($)' },
  { id: 'safetyViolations' as const,   label: 'Safety' },
] as const;

type KpiId = (typeof KPI_OPTIONS)[number]['id'];
const DEFAULT_KPIS: KpiId[] = ['score', 'avgMpg', 'idlePct', 'driveTimeHrs', 'totalMiles'];
const STORAGE_KEY_PREFIX = 'kl_mom_kpis';

function formatKpiValue(kpiId: KpiId, row: DriverRow): string {
  const v = row[kpiId as keyof DriverRow] as number;
  if (v === undefined || v === null) return '—';
  switch (kpiId) {
    case 'score':             return String(Math.round(v));
    case 'avgMpg':            return v.toFixed(2);
    case 'idlePct':           return v.toFixed(1) + '%';
    case 'driveTimeHrs':      return v.toFixed(1);
    case 'idleTimeHrs':       return v.toFixed(1);
    case 'totalMiles':        return Math.round(v).toLocaleString();
    case 'totalFuelGal':      return Math.round(v).toLocaleString();
    case 'idleFuelGal':       return Math.round(v).toLocaleString();
    case 'estimatedFuelCost': return '$' + Math.round(v).toLocaleString();
    case 'safetyViolations':  return v === 0 ? '—' : String(v);
  }
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatWeekLabel(mondayKey: string): string {
  const start = new Date(mondayKey + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

interface MonthOverMonthViewProps {
  months: string[];
  monthlyByDriver: Map<number, MonthlyDriverData>;
  weeks: string[];
  weeklyByDriver: Map<number, WeeklyDriverData>;
}

export function MonthOverMonthView({
  months,
  monthlyByDriver,
  weeks,
  weeklyByDriver,
}: MonthOverMonthViewProps) {
  const { user } = useUser();
  const storageKey = `${STORAGE_KEY_PREFIX}_${user?.id ?? 'anon'}`;

  const [granularity, setGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [selectedKpis, setSelectedKpis] = useState<KpiId[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_KPIS;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as KpiId[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_KPIS;
  });

  // Persist selections whenever they change
  useEffect(() => {
    if (!user?.id) return;
    try { localStorage.setItem(storageKey, JSON.stringify(selectedKpis)); } catch { /* ignore */ }
  }, [selectedKpis, storageKey, user?.id]);

  const periods = granularity === 'monthly' ? months : weeks;
  const byDriver = granularity === 'monthly' ? monthlyByDriver : weeklyByDriver;

  const getPeriodRows = (data: MonthlyDriverData | WeeklyDriverData) =>
    granularity === 'monthly'
      ? (data as MonthlyDriverData).months
      : (data as WeeklyDriverData).weeks;

  const sortedDriverIds = useMemo(() => {
    return Array.from((byDriver as Map<number, MonthlyDriverData | WeeklyDriverData>).entries())
      .map(([driverId, data]) => {
        const rows = getPeriodRows(data);
        const scores = Array.from(rows.values()).map(r => r.score);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return { driverId, avgScore };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .map(d => d.driverId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDriver, granularity]);

  function toggleKpi(kpiId: KpiId) {
    setSelectedKpis(prev => {
      if (prev.includes(kpiId)) {
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== kpiId);
      }
      return [...prev, kpiId];
    });
  }

  if (byDriver.size === 0) {
    return (
      <EmptyState
        title="No Data"
        description={`No driver utilization records found for the past ${granularity === 'monthly' ? '12 months' : '16 weeks'}.`}
      />
    );
  }

  const formatPeriodLabel = (key: string) =>
    granularity === 'monthly' ? formatMonthLabel(key) : formatWeekLabel(key);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Granularity toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          {(['monthly', 'weekly'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0 border-border cursor-pointer ${
                granularity === g
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground bg-transparent hover:bg-accent'
              }`}
            >
              {g === 'monthly' ? 'Month over Month' : 'Week over Week'}
            </button>
          ))}
        </div>

        {/* KPI selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            KPIs — select any
          </span>
          <div className="flex flex-wrap gap-1.5">
            {KPI_OPTIONS.map(kpi => {
              const isSelected = selectedKpis.includes(kpi.id);
              return (
                <button
                  key={kpi.id}
                  onClick={() => toggleKpi(kpi.id)}
                  className={[
                    'text-xs px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-accent',
                  ].join(' ')}
                >
                  {kpi.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="sticky left-0 z-20 bg-muted text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-1.5 h-auto min-w-[160px]">
                Driver / KPI
              </TableHead>
              {periods.map(p => (
                <TableHead
                  key={p}
                  className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-2 py-1.5 h-auto text-right min-w-[70px] whitespace-nowrap"
                >
                  {formatPeriodLabel(p)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDriverIds.map(driverId => {
              const data = byDriver.get(driverId);
              if (!data) return null;
              const periodRows = getPeriodRows(data);
              return (
                <DriverGroup
                  key={driverId}
                  driverName={data.driverName}
                  periods={periods}
                  periodRows={periodRows}
                  selectedKpis={selectedKpis}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DriverGroup({
  driverName,
  periods,
  periodRows,
  selectedKpis,
}: {
  driverName: string;
  periods: string[];
  periodRows: Map<string, DriverRow>;
  selectedKpis: KpiId[];
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40 border-t border-border">
        <TableCell className="sticky left-0 z-10 bg-muted/40 text-[12px] font-semibold px-3 py-1.5">
          {driverName}
        </TableCell>
        {periods.map(p => (
          <TableCell key={p} className="px-2 py-1.5" />
        ))}
      </TableRow>

      {selectedKpis.map(kpiId => {
        const kpiLabel = KPI_OPTIONS.find(k => k.id === kpiId)!.label;
        return (
          <TableRow key={kpiId} className="hover:bg-accent/30">
            <TableCell className="sticky left-0 z-10 bg-background text-[11px] text-muted-foreground px-3 py-1 pl-7">
              {kpiLabel}
            </TableCell>
            {periods.map(p => {
              const row = periodRows.get(p);
              return (
                <TableCell key={p} className="text-[12px] tabular-nums text-right px-2 py-1">
                  {row ? formatKpiValue(kpiId, row) : <span className="text-muted-foreground/40">—</span>}
                </TableCell>
              );
            })}
          </TableRow>
        );
      })}
    </>
  );
}
