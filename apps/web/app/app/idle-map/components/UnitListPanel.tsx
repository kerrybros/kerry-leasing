'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import type { EnrichedIdleEvent, GroupBy } from '../types';
import { formatDuration, fuelStr } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  groupBy: GroupBy;
  onGroupByChange: (v: GroupBy) => void;
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
}

interface UnitRow {
  key: string;
  totalMinutes: number;
  totalFuel: number;
  eventCount: number;
}

// By design, groupBy can only be changed while the panel is open.
// The toggle button remains visible when panel is closed; opening it reveals the control.
export default function UnitListPanel({ events, groupBy, onGroupByChange, selectedKeys, onSelectionChange, open, onToggle, loading }: Props) {
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

  const title = groupBy === 'driver' ? 'Drivers' : 'Vehicles';

  function toggleRow(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectionChange(selectedKeys.filter(k => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  }

  return (
    <>
      {/* Toggle button on left edge */}
      <button
        onClick={onToggle}
        className={`absolute ${open ? 'left-56' : 'left-0'} top-1/2 -translate-y-1/2 z-20 bg-card border border-border rounded-r-md px-1 py-3 shadow-md hover:bg-muted transition-colors`}
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
          <div className="px-3 pt-3 pb-2 border-b border-border flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
              <p className="text-[10px] text-muted-foreground/60">{rows.length.toLocaleString('en-US')} · by idle time</p>
            </div>
            {/* Group by toggle in panel header */}
            <div className="flex w-full h-6 border border-input rounded overflow-hidden text-[10px]">
              {(['vehicle', 'driver'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => v !== groupBy && (onGroupByChange(v), onSelectionChange([]))}
                  className={`flex-1 capitalize transition-colors ${
                    groupBy === v
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {v === 'vehicle' ? 'Vehicle' : 'Driver'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/60">No data</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {selectedKeys.length > 0 && (
                <button
                  onClick={() => onSelectionChange([])}
                  className="w-full text-[10px] text-primary hover:text-primary/80 py-1 border-b border-border/40 transition-colors"
                >
                  Clear selection ({selectedKeys.length.toLocaleString('en-US')})
                </button>
              )}
              <div className="flex flex-col">
                {rows.map((row) => {
                  const isSelected = selectedKeys.includes(row.key);
                  const isDimmed = selectedKeys.length > 0 && !isSelected;
                  return (
                    <button
                      key={row.key}
                      onClick={() => toggleRow(row.key)}
                      className={`flex flex-col px-3 py-2 border-b border-border/40 text-left w-full transition-colors ${
                        isSelected
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : isDimmed
                          ? 'opacity-40 hover:opacity-70 hover:bg-muted/30'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}
                        >
                          {row.key}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{row.eventCount.toLocaleString('en-US')} events</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          {formatDuration(row.totalMinutes)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {fuelStr(row.totalFuel)}
                        </span>
                      </div>
                    </button>
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
