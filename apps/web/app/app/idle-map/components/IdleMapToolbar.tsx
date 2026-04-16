'use client';

import { useState } from 'react';
import { CalendarIcon, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { DateRange, ViewMode, BubbleMode, GroupBy, FilterState, EnrichedIdleEvent } from '../types';
import { driverLabel } from '../types';

interface Props {
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  bubbleMode: BubbleMode;
  onBubbleModeChange: (v: BubbleMode) => void;
  groupBy: GroupBy;
  onGroupByChange: (v: GroupBy) => void;
  geofenceVisible: boolean;
  onGeofenceVisibleChange: (v: boolean) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  events: EnrichedIdleEvent[];
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
  groupBy,
  onGroupByChange,
  geofenceVisible,
  onGeofenceVisibleChange,
  filters,
  onFiltersChange,
  events,
  loading,
}: Props) {
  const [dateOpen, setDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateRange.from);
  const [customTo, setCustomTo] = useState(dateRange.to);
  const [filterOpen, setFilterOpen] = useState(false);

  // Derived options from event data
  const vehicleOptions = [...new Set(events.map(e => e.unitNumber).filter(Boolean))].sort() as string[];
  const driverOptions = [...new Set(events.map(e => driverLabel(e)))].sort();

  const activeFilterCount =
    filters.vehicles.length +
    filters.drivers.length +
    (filters.minDurationMinutes > 0 ? 1 : 0) +
    filters.endTypes.length +
    (filters.geofenceScope !== 'all' ? 1 : 0);

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
        <ToggleGroupItem value="heatmap" className="h-8 px-3 text-xs rounded-none">Heatmap</ToggleGroupItem>
        <ToggleGroupItem value="bubbles" className="h-8 px-3 text-xs rounded-none">Bubbles</ToggleGroupItem>
      </ToggleGroup>

      {/* Bubble sub-mode */}
      {viewMode === 'bubbles' && (
        <ToggleGroup
          value={[bubbleMode]}
          onValueChange={(values) => handleToggleGroup(values, bubbleMode, onBubbleModeChange)}
          className="h-8 border border-input rounded-md overflow-hidden"
        >
          <ToggleGroupItem value="clustered" className="h-8 px-3 text-xs rounded-none">Clustered</ToggleGroupItem>
          <ToggleGroupItem value="raw" className="h-8 px-3 text-xs rounded-none">Raw</ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Group by: Vehicle | Driver */}
      <ToggleGroup
        value={[groupBy]}
        onValueChange={(values) => handleToggleGroup(values, groupBy, onGroupByChange)}
        className="h-8 border border-input rounded-md overflow-hidden"
      >
        <ToggleGroupItem value="vehicle" className="h-8 px-3 text-xs rounded-none">Vehicle</ToggleGroupItem>
        <ToggleGroupItem value="driver" className="h-8 px-3 text-xs rounded-none">Driver</ToggleGroupItem>
      </ToggleGroup>

      {/* Geofences toggle */}
      <div className="flex items-center gap-1.5 h-8 px-2 border border-input rounded-md">
        <Switch
          id="geofence-toggle"
          checked={geofenceVisible}
          onCheckedChange={onGeofenceVisibleChange}
          className="scale-75"
        />
        <Label htmlFor="geofence-toggle" className="text-xs cursor-pointer select-none">
          Geofences
        </Label>
      </div>

      {/* Filters popover */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 h-8 text-xs relative')}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1 py-0 h-4 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold">Filters</p>

            {/* Vehicle multi-select */}
            {vehicleOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Vehicles ({filters.vehicles.length > 0 ? `${filters.vehicles.length} selected` : 'all'})
                </Label>
                <div className="max-h-28 overflow-y-auto flex flex-col gap-1">
                  {vehicleOptions.map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <Checkbox
                        id={`v-${v}`}
                        checked={filters.vehicles.includes(v)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...filters.vehicles, v]
                            : filters.vehicles.filter(x => x !== v);
                          onFiltersChange({ ...filters, vehicles: next });
                        }}
                      />
                      <Label htmlFor={`v-${v}`} className="text-xs cursor-pointer">{v}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Driver multi-select */}
            {driverOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Drivers ({filters.drivers.length > 0 ? `${filters.drivers.length} selected` : 'all'})
                </Label>
                <div className="max-h-28 overflow-y-auto flex flex-col gap-1">
                  {driverOptions.map(d => (
                    <div key={d} className="flex items-center gap-2">
                      <Checkbox
                        id={`d-${d}`}
                        checked={filters.drivers.includes(d)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...filters.drivers, d]
                            : filters.drivers.filter(x => x !== d);
                          onFiltersChange({ ...filters, drivers: next });
                        }}
                      />
                      <Label htmlFor={`d-${d}`} className="text-xs cursor-pointer">{d}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Min duration slider — Base UI Slider value is number | readonly number[] */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Min Duration: {filters.minDurationMinutes > 0 ? `${filters.minDurationMinutes}m` : 'any'}
              </Label>
              <Slider
                min={0}
                max={120}
                step={5}
                value={[filters.minDurationMinutes]}
                onValueChange={(raw) => {
                  const v = Array.isArray(raw) ? raw[0] : raw;
                  onFiltersChange({ ...filters, minDurationMinutes: v ?? 0 });
                }}
              />
            </div>

            {/* End type checkboxes */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Type</Label>
              {(['vehicle_moving', 'engine_stop'] as const).map(et => (
                <div key={et} className="flex items-center gap-2">
                  <Checkbox
                    id={`et-${et}`}
                    checked={filters.endTypes.includes(et)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...filters.endTypes, et]
                        : filters.endTypes.filter(x => x !== et);
                      onFiltersChange({ ...filters, endTypes: next });
                    }}
                  />
                  <Label htmlFor={`et-${et}`} className="text-xs cursor-pointer capitalize">
                    {et.replace('_', ' ')}
                  </Label>
                </div>
              ))}
            </div>

            {/* Geofence scope radio */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</Label>
              {(['all', 'inside', 'outside'] as const).map(scope => (
                <div key={scope} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`scope-${scope}`}
                    name="geofenceScope"
                    value={scope}
                    checked={filters.geofenceScope === scope}
                    onChange={() => onFiltersChange({ ...filters, geofenceScope: scope })}
                    className="accent-primary"
                  />
                  <Label htmlFor={`scope-${scope}`} className="text-xs cursor-pointer capitalize">
                    {scope === 'all' ? 'All locations' : scope === 'inside' ? 'Inside geofences' : 'Outside geofences'}
                  </Label>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={cn('h-7 text-xs', activeFilterCount === 0 && 'opacity-40 pointer-events-none')}
              onClick={() =>
                onFiltersChange({ vehicles: [], drivers: [], minDurationMinutes: 0, endTypes: [], geofenceScope: 'all' })
              }
            >
              Clear all filters
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {loading && (
        <span className="text-xs text-muted-foreground animate-pulse ml-1">Loading…</span>
      )}
    </div>
  );
}
