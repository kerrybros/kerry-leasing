'use client';

import { useState } from 'react';

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

export function DateRangePicker({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange 
}: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>('custom');

  const applyPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    if (preset === 'custom') return;

    const today = new Date();
    let start = new Date();
    let end = new Date();

    // Helper to format date as YYYY-MM-DD
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

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
        // Assuming Sunday start
        start.setDate(today.getDate() - today.getDay());
        end = today;
        break;
      case 'last_week':
        // Last week Sunday to Saturday
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
      case 'this_quarter':
        const currentQuarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), currentQuarter * 3, 1);
        end = today;
        break;
      case 'last_quarter':
        const prevQuarter = Math.floor(today.getMonth() / 3) - 1;
        if (prevQuarter < 0) {
          start = new Date(today.getFullYear() - 1, 9, 1);
          end = new Date(today.getFullYear() - 1, 11, 31); // Dec 31
          // Correct end of last quarter:
          // Q4 prev year: Oct 1 - Dec 31
          end = new Date(today.getFullYear(), 0, 0); // Dec 31
        } else {
          start = new Date(today.getFullYear(), prevQuarter * 3, 1);
          end = new Date(today.getFullYear(), (prevQuarter + 1) * 3, 0);
        }
        break;
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
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-bg-tertiary rounded-lg border border-border">
      {/* Preset Select */}
      <select
        value={selectedPreset}
        onChange={(e) => applyPreset(e.target.value as Preset)}
        className="p-2 rounded-md border border-border bg-bg-card text-text-primary text-sm min-h-[44px] cursor-pointer"
      >
        <option value="custom">Custom Range</option>
        <option value="this_month">This Month</option>
        <option value="last_7_days">Last 7 Days</option>
        <option value="this_week">This Week</option>
        <option value="last_week">Last Week</option>
        <option value="last_30_days">Last 30 Days</option>
        <option value="last_month">Last Month</option>
        <option value="last_12_months">Last 12 Months</option>
        <option value="this_quarter">This Quarter</option>
        <option value="last_quarter">Last Quarter</option>
        <option value="this_year">This Year</option>
        <option value="last_year">Last Year</option>
      </select>

      <div className="w-px h-8 bg-border hidden sm:block" style={{ display: 'none' }} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleManualChange('start', e.target.value)}
          className="w-full sm:w-auto p-2 rounded-md border border-border bg-bg-card text-text-primary text-sm min-h-[44px]"
        />
        <span className="text-text-secondary hidden sm:inline">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleManualChange('end', e.target.value)}
          className="w-full sm:w-auto p-2 rounded-md border border-border bg-bg-card text-text-primary text-sm min-h-[44px]"
        />
      </div>
    </div>
  );
}
