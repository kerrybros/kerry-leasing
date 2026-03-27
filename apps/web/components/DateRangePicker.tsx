'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

type Preset =
  | 'custom'
  | 'this_month'
  | 'last_7_days'
  | 'this_week'
  | 'last_week'
  | 'last_30_days'
  | 'last_month'
  | 'last_12_months'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year';

const formatDate = (d: Date) => d.toISOString().split('T')[0];

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>('custom');

  const applyPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    if (preset === 'custom') return;

    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;
      case 'last_7_days':
        start.setDate(today.getDate() - 7);
        end = today;
        break;
      case 'this_week':
        start.setDate(today.getDate() - today.getDay());
        end = today;
        break;
      case 'last_week':
        start.setDate(today.getDate() - today.getDay() - 7);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'last_30_days':
        start.setDate(today.getDate() - 30);
        end = today;
        break;
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last_12_months':
        start.setFullYear(today.getFullYear() - 1);
        end = today;
        break;
      case 'this_quarter': {
        const q = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), q * 3, 1);
        end = today;
        break;
      }
      case 'last_quarter': {
        const pq = Math.floor(today.getMonth() / 3) - 1;
        if (pq < 0) {
          start = new Date(today.getFullYear() - 1, 9, 1);
          end = new Date(today.getFullYear(), 0, 0);
        } else {
          start = new Date(today.getFullYear(), pq * 3, 1);
          end = new Date(today.getFullYear(), (pq + 1) * 3, 0);
        }
        break;
      }
      case 'this_year':
        start = new Date(today.getFullYear(), 0, 1);
        end = today;
        break;
      case 'last_year':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
    }

    onStartDateChange(formatDate(start));
    onEndDateChange(formatDate(end));
  };

  const handleManualChange = (type: 'start' | 'end', value: string) => {
    setSelectedPreset('custom');
    if (type === 'start') onStartDateChange(value);
    else onEndDateChange(value);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-card rounded-lg border border-border">
      <Select value={selectedPreset} onValueChange={(v) => applyPreset(v as Preset)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom Range</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="last_7_days">Last 7 Days</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="last_week">Last Week</SelectItem>
          <SelectItem value="last_30_days">Last 30 Days</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="last_12_months">Last 12 Months</SelectItem>
          <SelectItem value="this_quarter">This Quarter</SelectItem>
          <SelectItem value="last_quarter">Last Quarter</SelectItem>
          <SelectItem value="this_year">This Year</SelectItem>
          <SelectItem value="last_year">Last Year</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => handleManualChange('start', e.target.value)}
          className="w-[145px]"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => handleManualChange('end', e.target.value)}
          className="w-[145px]"
        />
      </div>
    </div>
  );
}
