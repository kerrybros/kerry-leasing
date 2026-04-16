'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/Skeleton';

import type { EnrichedIdleEvent } from '../types';
import { formatDuration, fuelStr } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  loading: boolean;
  dieselPrice: number;
}

export default function InsideOutsideBar({ events, loading, dieselPrice }: Props) {
  const stats = useMemo(() => {
    const inside = events.filter(e => e.geofenceId != null);
    const outside = events.filter(e => e.geofenceId == null);

    const sum = (arr: EnrichedIdleEvent[], key: 'durationMinutes' | 'idleFuelGallons') =>
      arr.reduce((s, e) => s + (e[key] ?? 0), 0);

    const inEvents = inside.length;
    const outEvents = outside.length;
    const total = events.length;
    const inMinutes = sum(inside, 'durationMinutes');
    const outMinutes = sum(outside, 'durationMinutes');
    const inFuel = sum(inside, 'idleFuelGallons');
    const outFuel = sum(outside, 'idleFuelGallons');
    const inPct = total > 0 ? (inEvents / total) * 100 : 0;

    return { inEvents, outEvents, inMinutes, outMinutes, inFuel, outFuel, inPct, total };
  }, [events, dieselPrice]);

  if (loading) {
    return <Skeleton style={{ height: 56, borderRadius: 8 }} />;
  }

  if (stats.total === 0) {
    return (
      <div className="h-14 flex items-center justify-center rounded-lg border border-border bg-card">
        <p className="text-xs text-muted-foreground">No events to compare inside vs. outside geofences</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 flex flex-col gap-2">
      {/* Proportional bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0">Inside</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden bg-muted flex">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${stats.inPct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground w-14 shrink-0">Outside</span>
      </div>

      {/* Stat chips */}
      <div className="flex items-center justify-between gap-2">
        {/* Inside chips */}
        <div className="flex gap-2">
          <Chip label="Events" value={stats.inEvents.toLocaleString()} side="in" />
          <Chip label="Time" value={formatDuration(stats.inMinutes)} side="in" />
          <Chip label="Fuel" value={fuelStr(stats.inFuel)} side="in" />
        </div>

        {/* Divider */}
        <div className="text-[10px] text-muted-foreground/40 font-medium select-none">|</div>

        {/* Outside chips */}
        <div className="flex gap-2">
          <Chip label="Events" value={stats.outEvents.toLocaleString()} side="out" />
          <Chip label="Time" value={formatDuration(stats.outMinutes)} side="out" />
          <Chip label="Fuel" value={fuelStr(stats.outFuel)} side="out" />
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, side }: { label: string; value: string; side: 'in' | 'out' }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none">{label}</span>
      <span
        className={`text-[11px] font-semibold leading-tight ${
          side === 'in' ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
