'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { EnrichedIdleEvent, GroupBy } from '../types';
import { formatDuration, fuelStr } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  groupBy: GroupBy;
  open: boolean;
  onToggle: () => void;
}

interface UnitRow {
  key: string;
  totalMinutes: number;
  totalFuel: number;
  eventCount: number;
}

export default function UnitListPanel({ events, groupBy, open, onToggle }: Props) {
  const rows = useMemo<UnitRow[]>(() => {
    const map = new Map<string, UnitRow>();
    for (const e of events) {
      const key = e.groupKey;
      const cur = map.get(key) ?? { key, totalMinutes: 0, totalFuel: 0, eventCount: 0 };
      cur.totalMinutes += e.durationMinutes ?? 0;
      cur.totalFuel += e.idleFuelGallons ?? 0;
      cur.eventCount += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [events]);

  const worstMinutes = rows[0]?.totalMinutes ?? 0;
  const title = groupBy === 'driver' ? 'Drivers' : 'Vehicles';

  return (
    <>
      {/* Toggle button on left edge */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-card/90 border border-border rounded-r-md px-1 py-3 shadow-sm hover:bg-muted transition-colors"
        aria-label={open ? 'Close unit list' : 'Open unit list'}
      >
        {open ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {/* Slide-in panel */}
      {open && (
        <div
          className="absolute left-0 top-0 bottom-0 z-10 w-56 border-r border-border shadow-md flex flex-col overflow-hidden"
          style={{ backdropFilter: 'blur(8px)', background: 'hsl(var(--card) / 0.92)' }}
        >
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="text-[10px] text-muted-foreground/60">{rows.length} {groupBy === 'driver' ? 'drivers' : 'units'} · sorted by idle time</p>
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/60">No data</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex flex-col">
                {rows.map((row, i) => {
                  const isWorst = i === 0 && worstMinutes > 0;
                  return (
                    <div
                      key={row.key}
                      className="flex flex-col px-3 py-2 border-b border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-medium truncate ${isWorst ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}
                        >
                          {row.key}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{row.eventCount} events</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          {formatDuration(row.totalMinutes)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {fuelStr(row.totalFuel)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
