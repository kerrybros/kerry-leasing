'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import type { DateRange, ViewMode, BubbleMode, FilterState } from '../types';
import { UnitTypeFilter } from '@/components/UnitTypeFilter';
import type { UnitType } from '@/hooks/useDataQueries';

interface Props {
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  bubbleMode: BubbleMode;
  onBubbleModeChange: (v: BubbleMode) => void;
  geofenceVisible: boolean;
  onGeofenceVisibleChange: (v: boolean) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  selectedUnitTypes: UnitType[];
  onUnitTypesChange: (types: UnitType[]) => void;
  availableUnitTypes: UnitType[];
  loading: boolean;
}

type DatePreset = { label: string; from: () => string; to: () => string };

function ymd(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

const MAX_RANGE_DAYS = 92; // one calendar quarter, inclusive

function rangeSpanDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000
  ) + 1;
}

/** First day of the calendar quarter containing `d` (local). */
function startOfCalendarQuarter(d: Date): Date {
  const startMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), startMonth, 1);
}

const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Yesterday',
    from: () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); },
    to: () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); },
  },
  {
    label: 'Last 7d',
    from: () => { const d = new Date(); d.setDate(d.getDate() - 6); return ymd(d); },
    to: () => ymd(new Date()),
  },
  {
    label: 'Last 30d',
    from: () => { const d = new Date(); d.setDate(d.getDate() - 29); return ymd(d); },
    to: () => ymd(new Date()),
  },
  {
    label: 'This Month',
    from: () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); },
    to: () => ymd(new Date()),
  },
  {
    label: 'Last Month',
    from: () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)); },
    to: () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 0)); },
  },
  {
    label: 'This quarter',
    from: () => ymd(startOfCalendarQuarter(new Date())),
    to: () => ymd(new Date()),
  },
  {
    label: 'Last quarter',
    from: () => {
      const now = new Date();
      const startThis = startOfCalendarQuarter(now);
      const endLast = new Date(startThis);
      endLast.setDate(endLast.getDate() - 1);
      const startLast = new Date(endLast.getFullYear(), Math.floor(endLast.getMonth() / 3) * 3, 1);
      return ymd(startLast);
    },
    to: () => {
      const now = new Date();
      const startThis = startOfCalendarQuarter(now);
      const endLast = new Date(startThis);
      endLast.setDate(endLast.getDate() - 1);
      return ymd(endLast);
    },
  },
];

function formatDateRangeLabel(range: DateRange): string {
  if (range.from === range.to) {
    return new Date(range.from + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const f = new Date(range.from + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = new Date(range.to + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${f} – ${t}`;
}

/** Preset `label` when the range matches a preset, else `null` (custom range). */
function matchingPresetLabel(range: DateRange): string | null {
  for (const p of DATE_PRESETS) {
    if (p.from() === range.from && p.to() === range.to) return p.label;
  }
  return null;
}

export default function IdleMapToolbar({
  dateRange,
  onDateRangeChange,
  viewMode,
  onViewModeChange,
  bubbleMode,
  onBubbleModeChange,
  geofenceVisible,
  onGeofenceVisibleChange,
  filters,
  onFiltersChange,
  selectedUnitTypes,
  onUnitTypesChange,
  availableUnitTypes,
  loading,
}: Props) {
  const [dateOpen, setDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo, setCustomTo] = useState(dateRange.to);
  const [customError, setCustomError] = useState<string | null>(null);

  const activePresetLabel = useMemo(() => matchingPresetLabel(dateRange), [dateRange]);

  useEffect(() => {
    setCustomFrom(dateRange.from);
    setCustomTo(dateRange.to);
    setCustomError(null);
  }, [dateRange.from, dateRange.to]);

  function applyPreset(preset: DatePreset) {
    const range = { from: preset.from(), to: preset.to() };
    onDateRangeChange(range);
    setCustomFrom(range.from);
    setCustomTo(range.to);
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    if (rangeSpanDays(customFrom, customTo) > MAX_RANGE_DAYS) {
      setCustomError(`Range cannot exceed ${MAX_RANGE_DAYS} days (one quarter).`);
      return;
    }
    setCustomError(null);
    onDateRangeChange({ from: customFrom, to: customTo });
    setDateOpen(false);
  }

  // Base UI ToggleGroup uses string[] for value
  function handleToggleGroup<T extends string>(
    values: readonly string[],
    current: T,
    onChange: (v: T) => void
  ) {
    const next = values[values.length - 1] as T | undefined;
    if (next && next !== current) onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1 w-full">
      {/* Preset + custom range: always one row, side by side; scroll on very narrow viewports */}
      <div className="flex min-w-0 max-w-full shrink overflow-x-auto sm:overflow-x-visible [scrollbar-gutter:stable]">
        <div className="inline-flex flex-nowrap items-stretch pr-0.5">
      {/* One segmented control: same visual language as View mode / Heatmap toggles */}
      <div className="inline-flex h-8 min-h-0 items-stretch overflow-hidden rounded-md border border-input bg-background text-xs shadow-sm dark:border-input dark:bg-input/20">
        <Select
        value={activePresetLabel ?? undefined}
        onValueChange={v => {
          if (v == null || v === '') return;
          const p = DATE_PRESETS.find((x) => x.label === v);
          if (p) applyPreset(p);
        }}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            'h-8 w-40 min-w-40 max-w-40 shrink-0 !rounded-none border-0 border-r border-border/70',
            'bg-transparent px-2.5 text-xs shadow-none ring-0',
            'hover:bg-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0',
            'focus-visible:outline-none focus-visible:bg-muted/40',
            'aria-[expanded=true]:bg-muted/50',
            'data-[size=sm]:!rounded-none',
            'dark:border-border/50 dark:bg-transparent dark:hover:bg-muted/40',
            'dark:aria-[expanded=true]:bg-muted/30'
          )}
          aria-label="Date range presets"
        >
          <SelectValue placeholder="Presets" />
        </SelectTrigger>
        <SelectContent align="start" className="w-[var(--anchor-width)] min-w-44 rounded-md">
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.label} value={p.label} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom date range — flat segment, no second outline box */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex h-8 min-w-[10.5rem] max-w-[min(22rem,88vw)] shrink-0 grow items-center gap-1.5 rounded-none',
            'border-0 bg-transparent px-2.5 text-xs text-foreground shadow-none',
            'outline-none transition-colors sm:min-w-52',
            'hover:bg-muted/50 [aria-expanded=true]:bg-muted/50',
            'focus-visible:outline-none focus-visible:bg-muted/40',
            'dark:hover:bg-muted/40'
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left font-normal">
            {formatDateRangeLabel(dateRange)}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-2">Date range</p>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-input rounded px-2 py-1.5 bg-background"
            />
            <span className="text-muted-foreground text-xs shrink-0">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-input rounded px-2 py-1.5 bg-background"
            />
          </div>
          {customError && (
            <p className="text-xs text-destructive mt-2">{customError}</p>
          )}
          <Button size="sm" className="h-7 text-xs w-full mt-3" onClick={applyCustom}>
            Apply
          </Button>
        </PopoverContent>
      </Popover>
      </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 basis-full sm:basis-auto sm:shrink-0 sm:ml-auto">
      {/* View mode: Heatmap | Bubbles — Base UI ToggleGroup uses string[] */}
      <ToggleGroup
        value={[viewMode]}
        onValueChange={(values) => handleToggleGroup(values, viewMode, onViewModeChange)}
        className="h-8 border border-input rounded-md overflow-hidden"
      >
        <ToggleGroupItem value="heatmap" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Heatmap</ToggleGroupItem>
        <ToggleGroupItem value="bubbles" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Bubbles</ToggleGroupItem>
      </ToggleGroup>

      {/* Bubble sub-mode */}
      {viewMode === 'bubbles' && (
        <ToggleGroup
          value={[bubbleMode]}
          onValueChange={(values) => handleToggleGroup(values, bubbleMode, onBubbleModeChange)}
          className="h-8 border border-input rounded-md overflow-hidden"
        >
          <ToggleGroupItem value="clustered" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Clustered</ToggleGroupItem>
          <ToggleGroupItem value="raw" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Raw</ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Geofences toggle */}
      <div className="flex items-center gap-1.5 h-8 px-2 border border-input rounded-md">
        <button
          role="switch"
          aria-checked={geofenceVisible}
          onClick={() => onGeofenceVisibleChange(!geofenceVisible)}
          className={`relative inline-flex h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${geofenceVisible ? 'bg-primary' : 'bg-zinc-400'}`}
        >
          <span className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 mt-[2px] ${geofenceVisible ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
        </button>
        <Label className="text-xs cursor-pointer select-none" onClick={() => onGeofenceVisibleChange(!geofenceVisible)}>
          Geofences
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-muted-foreground/40 hover:text-muted-foreground transition-colors leading-none">
              <Info className="w-3 h-3" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-56">
              Toggle geofence zone boundaries on the map. Zones are named areas like yards, customer sites, and fuel stations. Events inside a zone are tagged so you can filter and compare inside vs. outside idle time.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Location scope toggle */}
      <ToggleGroup
        value={[filters.geofenceScope]}
        onValueChange={(values) => {
          const next = values[values.length - 1] as FilterState['geofenceScope'] | undefined;
          if (next && next !== filters.geofenceScope) onFiltersChange({ ...filters, geofenceScope: next });
        }}
        className="h-8 border border-input rounded-md overflow-hidden"
      >
        <ToggleGroupItem value="all" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">All</ToggleGroupItem>
        <ToggleGroupItem value="inside" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">In geofence</ToggleGroupItem>
        <ToggleGroupItem value="outside" className="h-8 px-3 text-xs rounded-none aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Outside</ToggleGroupItem>
      </ToggleGroup>

      {/* Unit type filter */}
      <UnitTypeFilter value={selectedUnitTypes} onChange={onUnitTypesChange} availableTypes={availableUnitTypes} />

      {viewMode === 'heatmap' && !loading && (
        <span className="text-xs text-muted-foreground/60 ml-1">Switch to Bubbles to explore individual events</span>
      )}

      {loading && (
        <span className="text-xs text-muted-foreground animate-pulse ml-1">Loading…</span>
      )}
      </div>
    </div>
  );
}
