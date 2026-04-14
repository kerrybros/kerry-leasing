'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { UnitMetrics, DriverMetrics, FleetTotals } from '@/features/fleet/types';
import { CHART_COLORS } from '@/features/fleet/utils/chartColors';
interface TelematicsBreakdownViewProps {
  loading?: boolean;
  viewMode: 'unit' | 'driver';
  tracksDrivers: boolean;
  unitMetrics: UnitMetrics[];
  driverMetrics: DriverMetrics[];
  fleetTotals: FleetTotals;
  selectedId: string | number | null;
  onRowClick: (id: string | number) => void;
}

type SortKey = 'label' | 'totalMiles' | 'avgMpg' | 'idlePercentage' | 'idleFuel' | 'idleTimeMinutes' | 'totalFuelGal' | 'drivingFuelGal' | 'driveTimeHrs';

function CompactBar({
  title,
  data,
  dataKey,
  color,
  formatter,
  onBarClick,
}: {
  title: string;
  data: (UnitMetrics & { label: string } | DriverMetrics & { label: string })[];
  dataKey: string;
  color: string;
  formatter?: (v: unknown) => string;
  onBarClick?: (item: UnitMetrics | DriverMetrics) => void;
}) {
  const chartH = Math.max(80, data.length * 24);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-2.5 pt-2 pb-0.5">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div style={{ height: chartH }} className="px-0 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={72}
              fontSize={9}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_COLORS.tick }}
            />
            <Tooltip active={false} />
            <Bar
              dataKey={dataKey}
              fill={color}
              radius={[0, 2, 2, 0]}
              isAnimationActive={false}
              barSize={13}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (d) => onBarClick(d as unknown as UnitMetrics | DriverMetrics) : undefined}
            >
              <LabelList
                dataKey={dataKey}
                position="right"
                formatter={formatter}
                style={{ fill: 'var(--foreground)', fontSize: 9, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TelematicsBreakdownView({
  loading,
  viewMode,
  unitMetrics,
  driverMetrics,
  fleetTotals,
  selectedId,
  onRowClick,
}: TelematicsBreakdownViewProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('totalMiles');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (loading) {
    return (
      <div className="flex gap-4">
        <div className="w-[250px] shrink-0 flex flex-col gap-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} style={{ height: 180, borderRadius: 8 }} />)}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    );
  }

  const isUnit = viewMode === 'unit';
  const metrics = isUnit ? unitMetrics : driverMetrics;

  const getLabel = (m: UnitMetrics | DriverMetrics) =>
    isUnit ? (m as UnitMetrics).unitNumber : (m as DriverMetrics).driverName;

  const TOP_N = Math.min(10, metrics.length);

  const withLabel = <T extends UnitMetrics | DriverMetrics>(arr: T[]) =>
    arr.map(m => ({ ...m, label: getLabel(m) }));

  const topIdlers = withLabel(
    [...metrics].sort((a, b) => parseFloat(b.idlePercentage) - parseFloat(a.idlePercentage)).slice(0, TOP_N)
  );
  const bestMpg = withLabel(
    [...metrics].sort((a, b) => parseFloat(b.avgMpg) - parseFloat(a.avgMpg)).slice(0, TOP_N)
  );
  const mostMiles = withLabel(
    [...metrics].sort((a, b) => b.totalMiles - a.totalMiles).slice(0, TOP_N)
  );
  const mostIdleFuel = withLabel(
    [...metrics].sort((a, b) => b.idleFuel - a.idleFuel).slice(0, TOP_N)
  );

  const sorted = [...metrics].sort((a, b) => {
    let av: number | string, bv: number | string;
    if (sortKey === 'label') { av = getLabel(a); bv = getLabel(b); }
    else if (sortKey === 'avgMpg' || sortKey === 'idlePercentage') {
      av = parseFloat(a[sortKey]); bv = parseFloat(b[sortKey]);
    } else {
      av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
      bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      <span className="ml-0.5 opacity-60 text-[8px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
    ) : null;

  // Format minutes → "Xh Ym"
  const fmtMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Format decimal hours → "Xh Ym"
  const fmtHrs = (hrs: number) => fmtMins(hrs * 60);

  type NavConfirm = { label: string; href: string } | null;
  const [navConfirm, setNavConfirm] = useState<NavConfirm>(null);

  useEffect(() => {
    if (!navConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavConfirm(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navConfirm]);

  const handleItemClick = (m: UnitMetrics | DriverMetrics) => {
    const label = isUnit ? (m as UnitMetrics).unitNumber : (m as DriverMetrics).driverName;
    const href = isUnit
      ? `/app/units/${(m as UnitMetrics).unitNumber ?? (m as UnitMetrics).vin}`
      : `/app/drivers/${(m as DriverMetrics).driverId}`;
    setNavConfirm({ label, href });
  };

  if (metrics.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No {isUnit ? 'unit' : 'driver'} data for the selected date range.
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {/* Left: 4 compact performer charts */}
      <div className="w-[250px] shrink-0 flex flex-col gap-2">
        <CompactBar
          title="Worst Idlers"
          data={topIdlers}
          dataKey="idlePercentage"
          color="#ef4444"
          formatter={(v) => `${v}%`}
          onBarClick={handleItemClick}
        />
        <CompactBar
          title="Best MPG"
          data={bestMpg}
          dataKey="avgMpg"
          color={CHART_COLORS.success}
          formatter={(v) => `${v}`}
          onBarClick={handleItemClick}
        />
        <CompactBar
          title="Highest Miles Driven"
          data={mostMiles}
          dataKey="totalMiles"
          color={CHART_COLORS.idle}
          formatter={(v) => Math.round(Number(v)).toLocaleString()}
          onBarClick={handleItemClick}
        />
        <CompactBar
          title="Most Idle Fuel"
          data={mostIdleFuel}
          dataKey="idleFuel"
          color="#f59e0b"
          formatter={(v) => `${Number(v).toLocaleString()} gal`}
          onBarClick={handleItemClick}
        />
      </div>

      {/* Right: full sortable table */}
      <div className="flex-1 min-w-0 overflow-x-auto rounded-lg border border-border self-start">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              {[
                { k: 'label' as SortKey, label: isUnit ? 'Unit' : 'Driver' },
                { k: 'totalMiles' as SortKey, label: 'Miles Driven' },
                { k: 'avgMpg' as SortKey, label: 'MPG' },
                { k: 'totalFuelGal' as SortKey, label: 'Total Fuel' },
                { k: 'drivingFuelGal' as SortKey, label: 'Drive Fuel' },
                { k: 'idlePercentage' as SortKey, label: 'Idle %' },
                { k: 'idleFuel' as SortKey, label: 'Idle Fuel' },
                { k: 'idleTimeMinutes' as SortKey, label: 'Idle Time' },
                { k: 'driveTimeHrs' as SortKey, label: 'Drive Time' },
              ].map(({ k, label }) => (
                <TableHead
                  key={k}
                  className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(k)}
                >
                  {label}<SortIcon k={k} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(m => {
              const id = isUnit ? (m as UnitMetrics).vin : (m as DriverMetrics).driverId;
              const isSelected = selectedId === id;
              const idlePct = parseFloat(m.idlePercentage);
              return (
                <TableRow
                  key={String(id)}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  style={{
                    background: isSelected ? 'var(--accent)' : undefined,
                    borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                  }}
                  onClick={() => { onRowClick(id); handleItemClick(m); }}
                >
                  <TableCell className="font-semibold text-[12px] px-3 py-2">{getLabel(m)}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{Math.round(m.totalMiles).toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{m.avgMpg}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{m.totalFuelGal.toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{m.drivingFuelGal.toLocaleString()}</TableCell>
                  <TableCell className={`text-[12px] px-3 py-2 tabular-nums font-semibold ${idlePct > 35 ? 'text-destructive' : idlePct > 25 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {m.idlePercentage}%
                  </TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{m.idleFuel.toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{fmtMins(m.idleTimeMinutes)}</TableCell>
                  <TableCell className="text-[12px] px-3 py-2 tabular-nums">{fmtHrs(m.driveTimeHrs)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/50 font-bold border-t-2 border-border hover:bg-muted/50">
              <TableCell className="font-bold text-[11px] px-3 py-2">Total</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{Math.round(fleetTotals.totalMiles).toLocaleString()}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{fleetTotals.avgMpg}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{Math.round(fleetTotals.totalFuel).toLocaleString()}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{Math.round(fleetTotals.totalDrivingFuel).toLocaleString()}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{fleetTotals.idlePercentage}%</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{Math.round(fleetTotals.totalIdleFuel).toLocaleString()}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{fmtMins(Math.round(fleetTotals.totalIdleTime))}</TableCell>
              <TableCell className="font-bold text-[11px] px-3 py-2 tabular-nums">{fmtMins(Math.round(fleetTotals.totalDrivingTime / 60))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Nav confirm popup */}
      {navConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setNavConfirm(null)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl p-5 w-72 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold leading-tight">
                  Open {isUnit ? 'unit' : 'driver'} details page
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{navConfirm.label}</p>
              </div>
              <button onClick={() => setNavConfirm(null)} className="text-muted-foreground hover:text-foreground cursor-pointer mt-0.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNavConfirm(null)}
                className="flex-1 h-8 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => window.open(navConfirm.href, '_blank')}
                className="flex-1 h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Open <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
