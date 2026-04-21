'use client';

import { useState } from 'react';
import { CalendarIcon, ChevronDown, Info } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Today',
    from: () => ymd(new Date()),
    to: () => ymd(new Date()),
  },
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
    label: 'Last 12 Months',
    from: () => { const d = new Date(); d.setMonth(d.getMonth() - 12); return ymd(d); },
    to: () => ymd(new Date()),
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

  function applyPreset(preset: DatePreset) {
    const range = { from: preset.from(), to: preset.to() };
    onDateRangeChange(range);
    setCustomFrom(range.from);
    setCustomTo(range.to);
    setDateOpen(false);
  }

  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) {
      onDateRangeChange({ from: customFrom, to: customTo });
      setDateOpen(false);
    }
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
    <div className="flex flex-wrap items-center gap-2 py-1">
      {/* Date picker — PopoverTrigger IS the button in @base-ui/react */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 h-8 text-xs')}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          {formatDateRangeLabel(dateRange)}
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="flex flex-col gap-1 mb-3">
            {DATE_PRESETS.map(p => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start h-7 text-xs"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="border-t pt-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Custom range</p>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background"
              />
            </div>
            <Button size="sm" className="h-7 text-xs w-full" onClick={applyCustom}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>

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
  );
}
