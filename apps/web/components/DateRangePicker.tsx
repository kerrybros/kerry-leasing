'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  minDate?: string;
}

type PresetId =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_12_months'
  | 'custom';

const formatDate = (d: Date) => d.toISOString().split('T')[0];

function computePreset(preset: PresetId): { start: string; end: string } | null {
  const today = new Date();
  const todayStr = formatDate(today);
  switch (preset) {
    case 'last_7_days': {
      const s = new Date(today); s.setDate(today.getDate() - 7);
      return { start: formatDate(s), end: todayStr };
    }
    case 'last_30_days': {
      const s = new Date(today); s.setDate(today.getDate() - 30);
      return { start: formatDate(s), end: todayStr };
    }
    case 'this_month':
      return { start: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)), end: todayStr };
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(s), end: formatDate(e) };
    }
    case 'last_quarter': {
      const pq = Math.floor(today.getMonth() / 3) - 1;
      if (pq < 0) {
        return {
          start: formatDate(new Date(today.getFullYear() - 1, 9, 1)),
          end: formatDate(new Date(today.getFullYear(), 0, 0)),
        };
      }
      return {
        start: formatDate(new Date(today.getFullYear(), pq * 3, 1)),
        end: formatDate(new Date(today.getFullYear(), (pq + 1) * 3, 0)),
      };
    }
    case 'this_year':
      return { start: formatDate(new Date(today.getFullYear(), 0, 1)), end: todayStr };
    case 'last_year':
      return {
        start: formatDate(new Date(today.getFullYear() - 1, 0, 1)),
        end: formatDate(new Date(today.getFullYear() - 1, 11, 31)),
      };
    case 'last_12_months': {
      const s = new Date(today);
      s.setMonth(today.getMonth() - 12);
      return { start: formatDate(s), end: todayStr };
    }
    default:
      return null;
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'last_7_days',  label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month',   label: 'This Month' },
  { id: 'last_month',   label: 'Last Month' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'this_year',    label: 'This Year' },
  { id: 'last_year',       label: 'Last Year' },
  { id: 'last_12_months', label: 'Last 12 Months' },
];

function detectPreset(start: string, end: string): PresetId {
  const presetIds: PresetId[] = [
    'last_7_days', 'last_30_days', 'this_month', 'last_month',
    'last_quarter', 'this_year', 'last_year', 'last_12_months',
  ];
  for (const id of presetIds) {
    const range = computePreset(id);
    if (range && range.start === start && range.end === end) return id;
  }
  return 'custom';
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minDate,
}: DateRangePickerProps) {
  const todayStr = formatDate(new Date());

  const [activePreset, setActivePreset] = useState<PresetId>(
    () => detectPreset(startDate, endDate)
  );

  useEffect(() => {
    setActivePreset(detectPreset(startDate, endDate));
  }, [startDate, endDate]);

  const applyPreset = (preset: PresetId) => {
    const range = computePreset(preset);
    if (!range) return;
    setActivePreset(preset);
    onStartDateChange(range.start);
    onEndDateChange(range.end);
  };

  const handleManualChange = (type: 'start' | 'end', value: string) => {
    setActivePreset('custom');
    if (type === 'start') onStartDateChange(value);
    else onEndDateChange(value);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={activePreset}
        onChange={e => {
          const val = e.target.value as PresetId;
          if (val === 'custom') return;
          applyPreset(val);
        }}
        className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        {PRESETS.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
        <option value="custom">Custom Range</option>
      </select>

      <Input
        type="date"
        value={startDate}
        min={minDate}
        max={todayStr}
        onChange={e => handleManualChange('start', e.target.value)}
        className="w-[138px] h-9 text-sm"
      />
      <span className="text-muted-foreground text-xs">to</span>
      <Input
        type="date"
        value={endDate}
        min={startDate}
        max={todayStr}
        onChange={e => handleManualChange('end', e.target.value)}
        className="w-[138px] h-9 text-sm"
      />
    </div>
  );
}
