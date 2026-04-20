'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/features/fleet/utils/chartColors';

import type { EnrichedIdleEvent, Geofence, DateRange, ModalTarget } from '../types';
import { formatDuration, driverLabel, fuelStr, costStr } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  geofences: Geofence[];
  dateRange: DateRange;
  dieselPrice: number;
  scopeFilter: ModalTarget;
  onClose: () => void;
}

type SortKey = 'date' | 'duration' | 'fuel' | 'cost' | 'unit' | 'driver';
type SortDir = 'asc' | 'desc';

function getScopeLabel(scope: ModalTarget, scopedEvents: EnrichedIdleEvent[]): string {
  if (scope.type === 'all') return 'Idle Report';
  if (scope.type === 'unit') return `Idle Report — Unit ${scope.value}`;
  if (scope.type === 'driver') return `Idle Report — ${scope.value}`;
  if (scope.type === 'eventSet') return `Idle Report — ${scopedEvents.length.toLocaleString('en-US')} events`;
  // Single event: show unit + date
  const e = scopedEvents[0];
  return e ? `Idle Event — Unit ${e.unitNumber ?? '?'} · ${e.date}` : 'Idle Event';
}

function scopeEvents(events: EnrichedIdleEvent[], scope: ModalTarget): EnrichedIdleEvent[] {
  if (scope.type === 'all') return events;
  if (scope.type === 'unit') return events.filter(e => e.unitNumber === scope.value);
  if (scope.type === 'driver') return events.filter(e => driverLabel(e) === scope.value);
  if (scope.type === 'event') return events.filter(e => e.id === scope.eventId);
  if (scope.type === 'eventSet') return events.filter(e => scope.eventIds.includes(e.id));
  return events;
}

function downloadCSV(rows: EnrichedIdleEvent[], dieselPrice: number, filename: string) {
  const header = [
    'Date', 'Start Time', 'End Time', 'Duration (min)', 'Fuel (gal)', 'Est. Cost ($)',
    'Unit', 'Driver', 'Location', 'Geofence', 'End Type',
  ].join(',');

  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csvRows = rows.map(e => [
    escape(e.date),
    escape(e.startTime ? new Date(e.startTime).toLocaleTimeString() : ''),
    escape(e.endTime ? new Date(e.endTime).toLocaleTimeString() : ''),
    escape(e.durationMinutes ?? ''),
    escape(e.idleFuelGallons?.toFixed(3) ?? ''),
    escape(((e.idleFuelGallons ?? 0) * dieselPrice).toFixed(2)),
    escape(e.unitNumber ?? ''),
    escape(driverLabel(e)),
    escape(e.location ?? ''),
    escape(e.geofenceName ?? ''),
    escape(e.endType ?? ''),
  ].join(','));

  const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Events table ──────────────────────────────────────────────────────────────

function EventsTable({
  events,
  dieselPrice,
  onUnitClick,
  onDriverClick,
}: {
  events: EnrichedIdleEvent[];
  dieselPrice: number;
  onUnitClick?: (unit: string) => void;
  onDriverClick?: (driver: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const PAGE_SIZE = 25;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    const copy = [...events];
    copy.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortKey === 'date') { av = a.date ?? ''; bv = b.date ?? ''; }
      else if (sortKey === 'duration') { av = a.durationMinutes ?? 0; bv = b.durationMinutes ?? 0; }
      else if (sortKey === 'fuel') { av = a.idleFuelGallons ?? 0; bv = b.idleFuelGallons ?? 0; }
      else if (sortKey === 'cost') { av = (a.idleFuelGallons ?? 0) * dieselPrice; bv = (b.idleFuelGallons ?? 0) * dieselPrice; }
      else if (sortKey === 'unit') { av = a.unitNumber ?? ''; bv = b.unitNumber ?? ''; }
      else if (sortKey === 'driver') { av = driverLabel(a); bv = driverLabel(b); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [events, sortKey, sortDir, dieselPrice]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function SortTh({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <TableHead
        className={`cursor-pointer select-none text-xs hover:text-foreground whitespace-nowrap ${className ?? ''}`}
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-0.5">
          {children}
          {active && (sortDir === 'asc' ? ' ↑' : ' ↓')}
        </span>
      </TableHead>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        {/* table-fixed keeps column widths stable when sort changes cell content length */}
        <Table className="table-fixed w-full">
          <colgroup>
            <col className="w-20" />
            <col className="w-28" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-40" />
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-24" />
          </colgroup>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-muted hover:bg-muted">
              <SortTh k="unit">Unit</SortTh>
              <SortTh k="driver">Driver</SortTh>
              <SortTh k="date">Date</SortTh>
              <SortTh k="duration">Duration</SortTh>
              <TableHead className="text-xs">Address</TableHead>
              <SortTh k="fuel">Fuel</SortTh>
              <SortTh k="cost">Est. Cost</SortTh>
              <TableHead className="text-xs">Geofence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map(e => (
              <TableRow key={e.id} className="text-sm">
                <TableCell>
                  {/* Use unitNumber ?? 'Unknown' to match GroupedTab getKey for vehicles */}
                  <button
                    className="font-medium hover:underline text-left truncate max-w-full block"
                    onClick={() => onUnitClick?.(e.unitNumber ?? 'Unknown')}
                  >
                    {e.unitNumber ?? '—'}
                  </button>
                </TableCell>
                <TableCell>
                  <button
                    className="text-muted-foreground hover:underline text-left truncate max-w-full block"
                    onClick={() => onDriverClick?.(driverLabel(e))}
                  >
                    {driverLabel(e)}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </TableCell>
                <TableCell>
                  <span className={
                    (e.durationMinutes ?? 0) > 120 ? 'text-destructive font-semibold' :
                    (e.durationMinutes ?? 0) > 60 ? 'text-amber-600 dark:text-amber-400' :
                    'text-foreground'
                  }>
                    {formatDuration(e.durationMinutes)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs truncate">{e.location ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{fuelStr(e.idleFuelGallons)}</TableCell>
                <TableCell className="text-muted-foreground">{costStr(e.idleFuelGallons, dieselPrice)}</TableCell>
                <TableCell>
                  {e.geofenceName
                    ? <Badge variant="secondary" className="text-[10px]">{e.geofenceName}</Badge>
                    : <span className="text-muted-foreground/40 text-xs">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {slice.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">
                  No events
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-2 justify-end text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span>{page + 1} / {pageCount}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ── Driver / Vehicle grouped tab ──────────────────────────────────────────────

type GroupSortKey = 'key' | 'events' | 'minutes' | 'fuel' | 'cost' | 'insidePct';

function GroupedTab({
  events,
  dieselPrice,
  getKey,
  label,
  expandToKey,
  onExpandApplied,
}: {
  events: EnrichedIdleEvent[];
  dieselPrice: number;
  getKey: (e: EnrichedIdleEvent) => string;
  label: string;
  expandToKey?: string | null;
  onExpandApplied?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<GroupSortKey>('minutes');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(k: GroupSortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  function GSortTh({ k, children, className }: { k: GroupSortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <TableHead
        className={`cursor-pointer select-none text-xs hover:text-foreground whitespace-nowrap ${className ?? ''}`}
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-0.5">
          {children}
          {active && (sortDir === 'asc' ? ' ↑' : ' ↓')}
        </span>
      </TableHead>
    );
  }

  // When a drill-down key arrives, expand that row and notify parent to clear drilldown.
  // Clearing drilldown allows the same unit to be re-clicked from All Events and re-expand.
  useEffect(() => {
    if (!expandToKey) return;
    setExpanded(expandToKey);
    onExpandApplied?.();
  }, [expandToKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const map = new Map<string, { events: EnrichedIdleEvent[]; totalMinutes: number; totalFuel: number }>();
    for (const e of events) {
      const k = getKey(e);
      const cur = map.get(k) ?? { events: [], totalMinutes: 0, totalFuel: 0 };
      cur.events.push(e);
      cur.totalMinutes += e.durationMinutes ?? 0;
      cur.totalFuel += e.idleFuelGallons ?? 0;
      map.set(k, cur);
    }
    const rows = [...map.entries()].map(([key, data]) => ({
      key,
      ...data,
      insidePct: data.events.length > 0
        ? Math.round((data.events.filter(e => e.geofenceId != null).length / data.events.length) * 100)
        : 0,
    }));

    rows.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortKey === 'key') { av = a.key; bv = b.key; }
      else if (sortKey === 'events') { av = a.events.length; bv = b.events.length; }
      else if (sortKey === 'minutes') { av = a.totalMinutes; bv = b.totalMinutes; }
      else if (sortKey === 'fuel') { av = a.totalFuel; bv = b.totalFuel; }
      else if (sortKey === 'cost') { av = a.totalFuel * dieselPrice; bv = b.totalFuel * dieselPrice; }
      else if (sortKey === 'insidePct') { av = a.insidePct; bv = b.insidePct; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [events, getKey, sortKey, sortDir, dieselPrice]);

  const totalMinutes = groups.reduce((s, g) => s + g.totalMinutes, 0);
  const totalFuel = groups.reduce((s, g) => s + g.totalFuel, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Summary row */}
      <div className="flex gap-4 text-sm">
        <span className="text-muted-foreground">{groups.length.toLocaleString('en-US')} {label}s</span>
        <span className="font-medium">{formatDuration(totalMinutes)} total idle</span>
        {totalFuel > 0 && <span className="text-muted-foreground">{fuelStr(totalFuel)} · {costStr(totalFuel, dieselPrice)}</span>}
      </div>

      <div>
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-muted hover:bg-muted">
              <GSortTh k="key">{label}</GSortTh>
              <GSortTh k="events">Events</GSortTh>
              <GSortTh k="minutes">Total Time</GSortTh>
              <GSortTh k="fuel">Fuel</GSortTh>
              <GSortTh k="cost">Est. Cost</GSortTh>
              <GSortTh k="insidePct">% In geofence</GSortTh>
              <TableHead className="text-xs w-6"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(g => (
              <Fragment key={g.key}>
                <TableRow
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => setExpanded(expanded === g.key ? null : g.key)}
                >
                  <TableCell className="font-medium text-sm">{g.key}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.events.length.toLocaleString('en-US')}</TableCell>
                  <TableCell className="text-sm font-semibold">{formatDuration(g.totalMinutes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fuelStr(g.totalFuel)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{costStr(g.totalFuel, dieselPrice)}</TableCell>
                  <TableCell className="text-sm">{g.insidePct}%</TableCell>
                  <TableCell>
                    {expanded === g.key
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </TableCell>
                </TableRow>
                {expanded === g.key && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0 bg-muted/20">
                      <div className="px-4 py-2">
                        <EventsTable events={g.events} dieselPrice={dieselPrice} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Geofences tab ─────────────────────────────────────────────────────────────

function GeofencesTab({ events, dieselPrice }: { events: EnrichedIdleEvent[]; dieselPrice: number }) {
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; category: string | null; events: EnrichedIdleEvent[] }>();
    const outside: EnrichedIdleEvent[] = [];
    for (const e of events) {
      if (e.geofenceId) {
        const cur = map.get(e.geofenceId) ?? { name: e.geofenceName ?? '', category: e.geofenceCategory, events: [] };
        cur.events.push(e);
        map.set(e.geofenceId, cur);
      } else {
        outside.push(e);
      }
    }
    const rows = [...map.entries()].map(([id, data]) => ({
      id,
      name: data.name,
      category: data.category,
      count: data.events.length,
      totalMinutes: data.events.reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
      totalFuel: data.events.reduce((s, e) => s + (e.idleFuelGallons ?? 0), 0),
    })).sort((a, b) => b.totalMinutes - a.totalMinutes);

    const outsideRow = {
      id: '__outside__',
      name: 'Outside All Geofences',
      category: null,
      count: outside.length,
      totalMinutes: outside.reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
      totalFuel: outside.reduce((s, e) => s + (e.idleFuelGallons ?? 0), 0),
    };

    return [...rows, outsideRow];
  }, [events, dieselPrice]);

  const chartData = groups.slice(0, 10).map(g => ({ name: g.name.length > 16 ? g.name.slice(0, 14) + '…' : g.name, fullName: g.name, minutes: g.totalMinutes }));

  const insideTotal = groups.filter(g => g.id !== '__outside__').reduce((s, g) => s + g.count, 0);
  const outsideTotal = groups.find(g => g.id === '__outside__')?.count ?? 0;
  const total = events.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-sm">
        <span>{total.toLocaleString('en-US')} total events</span>
        <span className="text-primary font-medium">{insideTotal.toLocaleString('en-US')} inside geofences ({total > 0 ? Math.round(insideTotal / total * 100) : 0}%)</span>
        <span className="text-muted-foreground">{outsideTotal.toLocaleString('en-US')} outside</span>
      </div>

      {chartData.length > 1 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} interval={0} />
              <YAxis fontSize={10} tick={{ fill: CHART_COLORS.tick }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [`${v}m`, 'Idle']} labelFormatter={(_label, payload) => (payload?.[0]?.payload as { fullName?: string })?.fullName ?? _label} />
              <Bar dataKey="minutes" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="text-xs">Geofence</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Events</TableHead>
              <TableHead className="text-xs">Total Idle</TableHead>
              <TableHead className="text-xs">Fuel</TableHead>
              <TableHead className="text-xs">Est. Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(g => (
              <TableRow key={g.id} className={g.id === '__outside__' ? 'opacity-70' : ''}>
                <TableCell className="text-sm font-medium">{g.name}</TableCell>
                <TableCell>
                  {g.category && <Badge variant="outline" className="text-[10px]">{g.category}</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.count.toLocaleString('en-US')}</TableCell>
                <TableCell className="text-sm">{formatDuration(g.totalMinutes)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fuelStr(g.totalFuel)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{costStr(g.totalFuel, dieselPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function IdleReportModal({
  events,
  geofences,
  dateRange,
  dieselPrice,
  scopeFilter,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState(scopeFilter.initialTab ?? 'events');
  // drilldown: set when user clicks unit/driver from All Events table to navigate + expand that row
  const [drilldown, setDrilldown] = useState<{ tab: 'drivers' | 'vehicles'; key: string } | null>(null);

  const scopedEvents = useMemo(() => scopeEvents(events, scopeFilter), [events, scopeFilter]);

  const title = getScopeLabel(scopeFilter, scopedEvents);
  const dateLabel = dateRange.from === dateRange.to
    ? new Date(dateRange.from + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : `${new Date(dateRange.from + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(dateRange.to + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  function handleDownloadCSV() {
    downloadCSV(scopedEvents, dieselPrice, `idle-report-${dateRange.from}-${dateRange.to}.csv`);
  }

  // Analytics for All Events tab
  const analytics = useMemo(() => {
    const totalMinutes = scopedEvents.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
    const totalFuel = scopedEvents.reduce((s, e) => s + (e.idleFuelGallons ?? 0), 0);
    const insideCount = scopedEvents.filter(e => e.geofenceId != null).length;
    const outsideCount = scopedEvents.length - insideCount;

    const byDate = new Map<string, number>();
    for (const e of scopedEvents) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + (e.durationMinutes ?? 0));
    }
    const dailyData = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, minutes]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        inside: scopedEvents.filter(e => e.date === date && e.geofenceId != null).reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
        outside: scopedEvents.filter(e => e.date === date && e.geofenceId == null).reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
      }));

    return { totalMinutes, totalFuel, insideCount, outsideCount, dailyData };
  }, [scopedEvents]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl sm:max-w-5xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs font-normal">{dateLabel}</Badge>
                <span className="text-xs text-muted-foreground">{scopedEvents.length.toLocaleString('en-US')} events</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadCSV}>
                <Download className="w-3.5 h-3.5" />
                CSV
              </Button>
              <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
                <X className="w-4 h-4" />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <TabsList className="px-6 py-0 h-10 rounded-none border-b border-border bg-transparent justify-start shrink-0">
            {(['events', 'drivers', 'vehicles', 'geofences'] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className={`text-xs rounded-none border-b-2 px-3 transition-none ${
                  activeTab === tab
                    ? 'border-primary font-semibold text-foreground bg-muted'
                    : 'border-transparent text-muted-foreground'
                }`}
                onClick={() => setDrilldown(null)}
              >
                {tab === 'events' ? 'All Events' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">

              {/* ── All Events tab ── */}
              <TabsContent value="events" className="mt-0 flex flex-col gap-5">
                {/* Analytics panels */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Idle Time */}
                  <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Idle Time</p>
                    <p className="text-2xl font-bold">{formatDuration(analytics.totalMinutes)}</p>
                    {analytics.dailyData.length > 0 && (
                      <div className="h-20">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.dailyData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                            <XAxis dataKey="date" hide />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [`${v}m`, '']} />
                            <Bar dataKey="inside" name="In geofence" stackId="a" fill={CHART_COLORS.primary} isAnimationActive={false} />
                            <Bar dataKey="outside" name="Outside geofence" stackId="a" fill={CHART_COLORS.idle} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Inside vs Outside geofences donut */}
                  <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inside vs Outside Geofences</p>
                    {scopedEvents.length > 0 ? (
                      <div className="h-28 flex items-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Inside geofences', value: analytics.insideCount },
                                { name: 'Outside geofences', value: analytics.outsideCount },
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={28}
                              outerRadius={44}
                              dataKey="value"
                              isAnimationActive={false}
                            >
                              <Cell fill={CHART_COLORS.primary} />
                              <Cell fill={CHART_COLORS.muted} />
                            </Pie>
                            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No data</p>
                    )}
                  </div>

                  {/* Idle Cost */}
                  <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Idle Cost</p>
                    <p className="text-2xl font-bold">{costStr(analytics.totalFuel, dieselPrice)}</p>
                    <p className="text-xs text-muted-foreground">{fuelStr(analytics.totalFuel)} wasted</p>
                    {analytics.dailyData.length > 0 && (
                      <div className="h-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.dailyData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                            <XAxis dataKey="date" hide />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown, n: unknown) => [`${v}m`, String(n)]} />
                            <Bar dataKey="inside" name="In geofence" stackId="b" fill={CHART_COLORS.primary} isAnimationActive={false} />
                            <Bar dataKey="outside" name="Outside geofence" stackId="b" fill={CHART_COLORS.idle} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>

                <EventsTable
                  events={scopedEvents}
                  dieselPrice={dieselPrice}
                  onUnitClick={(u) => {
                    // u is already normalised to ?? 'Unknown' by EventsTable's onClick
                    setDrilldown({ tab: 'vehicles', key: u });
                    setActiveTab('vehicles');
                  }}
                  onDriverClick={(d) => {
                    setDrilldown({ tab: 'drivers', key: d });
                    setActiveTab('drivers');
                  }}
                />
              </TabsContent>

              {/* ── Drivers tab ── */}
              <TabsContent value="drivers" className="mt-0">
                <GroupedTab
                  events={scopedEvents}
                  dieselPrice={dieselPrice}
                  getKey={driverLabel}
                  label="Driver"
                  expandToKey={drilldown?.tab === 'drivers' ? drilldown.key : null}
                  onExpandApplied={() => setDrilldown(null)}
                />
              </TabsContent>

              {/* ── Vehicles tab ── */}
              <TabsContent value="vehicles" className="mt-0">
                <GroupedTab
                  events={scopedEvents}
                  dieselPrice={dieselPrice}
                  getKey={(e) => e.unitNumber ?? 'Unknown'}
                  label="Vehicle"
                  expandToKey={drilldown?.tab === 'vehicles' ? drilldown.key : null}
                  onExpandApplied={() => setDrilldown(null)}
                />
              </TabsContent>

              {/* ── Geofences tab ── */}
              <TabsContent value="geofences" className="mt-0">
                <GeofencesTab events={scopedEvents} dieselPrice={dieselPrice} />
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
