'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { OrganizationSwitcher, useUser } from '@clerk/nextjs';
import { Loader2, Info, X, Settings2, Download } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDriversData } from '@/features/drivers/hooks/useDriversData';
import { MonthOverMonthView } from '@/features/drivers/components/MonthOverMonthView';
import { SmsPreviewView } from '@/features/drivers/components/SmsPreviewView';
import type { DriverRow } from '@/features/drivers/types';

type PageView = 'scorecard' | 'mom' | 'sms-preview';
type Granularity = 'monthly' | 'weekly';
type ColumnKey = keyof Omit<DriverRow, 'driverId' | 'driverName' | 'score' | 'safetyViolations'>;
type SortKey = 'driverName' | ColumnKey;

type PeriodOption = { key: string; label: string; start: string; end: string };

// All available scorecard columns
const ALL_COLUMNS: {
  key: ColumnKey;
  label: string;
  shortLabel: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
  colorFn?: (v: number) => string;
}[] = [
  {
    key: 'totalMiles',
    label: 'Miles Driven',
    shortLabel: 'Miles',
    higherIsBetter: true,
    format: v => Math.round(v).toLocaleString(),
  },
  {
    key: 'avgMpg',
    label: 'Avg MPG',
    shortLabel: 'MPG',
    higherIsBetter: true,
    format: v => v.toFixed(2),
  },
  {
    key: 'idlePct',
    label: 'Idle %',
    shortLabel: 'Idle %',
    higherIsBetter: false,
    format: v => v.toFixed(1) + '%',
    colorFn: v => v > 35 ? 'text-destructive font-semibold' : v > 25 ? 'text-amber-600 dark:text-amber-400 font-semibold' : '',
  },
  {
    key: 'idleFuelGal',
    label: 'Idle Fuel (gal)',
    shortLabel: 'Idle Fuel',
    higherIsBetter: false,
    format: v => Math.round(v).toLocaleString() + ' gal',
  },
  {
    key: 'drivingFuelGal',
    label: 'Driving Fuel (gal)',
    shortLabel: 'Drive Fuel',
    higherIsBetter: false,
    format: v => Math.round(v).toLocaleString() + ' gal',
  },
  {
    key: 'totalFuelGal',
    label: 'Total Fuel (gal)',
    shortLabel: 'Total Fuel',
    higherIsBetter: false,
    format: v => Math.round(v).toLocaleString() + ' gal',
  },
  {
    key: 'driveTimeHrs',
    label: 'Drive Time (hrs)',
    shortLabel: 'Drive (hrs)',
    higherIsBetter: true,
    format: v => v.toLocaleString(),
  },
  {
    key: 'idleTimeHrs',
    label: 'Idle Time (hrs)',
    shortLabel: 'Idle (hrs)',
    higherIsBetter: false,
    format: v => v.toLocaleString(),
  },
  {
    key: 'hardEvents',
    label: 'Hard Events',
    shortLabel: 'Hard Events',
    higherIsBetter: false,
    format: v => v === 0 ? '—' : String(v),
    colorFn: v => v > 10 ? 'text-destructive font-semibold' : v > 5 ? 'text-amber-600 dark:text-amber-400' : '',
  },
];

const DEFAULT_COLS: ColumnKey[] = ['totalMiles', 'avgMpg', 'idlePct', 'idleFuelGal', 'driveTimeHrs', 'totalFuelGal', 'hardEvents'];
const COL_STORAGE_PREFIX = 'kl_scorecard_cols';

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateMonths(): PeriodOption[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      start: fmtDate(new Date(year, month, 1)),
      end: fmtDate(new Date(year, month + 1, 0)),
    };
  });
}

function generateWeeks(): PeriodOption[] {
  const today = new Date();
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysSinceMonday);
  return Array.from({ length: 16 }, (_, i) => {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() - (15 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      key: fmtDate(weekStart),
      label: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      start: fmtDate(weekStart),
      end: fmtDate(weekEnd),
    };
  });
}

/**
 * Matched-window comparison ranges. The current period only has data through
 * today, so the previous period must cover the SAME elapsed span — otherwise a
 * partial month (e.g. May 1–15) gets compared against a full month (all of
 * April), which is apples-to-oranges. We cap the current window at today and
 * mirror that span onto the prior period.
 */
function comparisonRanges(
  current: PeriodOption,
  granularity: Granularity
): { curStart: string; curEnd: string; prevStart: string; prevEnd: string } {
  // Telematics data lags ~1 day, so the freshest complete day is yesterday.
  // Cap the current window there (never past the period, never before its
  // start) so it lines up exactly with the matched previous window.
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const periodStart = new Date(current.start + 'T00:00:00');
  const periodEnd = new Date(current.end + 'T00:00:00');
  let curEndDate = yesterday < periodEnd ? yesterday : periodEnd;
  if (curEndDate < periodStart) curEndDate = periodStart;

  if (granularity === 'monthly') {
    const [year, month] = current.start.split('-').map(Number); // month is 1-based
    const prevStart = new Date(year, month - 2, 1);
    const daysInPrev = new Date(year, month - 1, 0).getDate();
    const prevEndDay = Math.min(curEndDate.getDate(), daysInPrev);
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevEndDay);
    return {
      curStart: current.start,
      curEnd: fmtDate(curEndDate),
      prevStart: fmtDate(prevStart),
      prevEnd: fmtDate(prevEnd),
    };
  }
  // weekly: shift the (possibly partial) window back exactly 7 days
  const msPerDay = 86_400_000;
  const elapsedDays = Math.max(
    0,
    Math.floor((curEndDate.getTime() - periodStart.getTime()) / msPerDay)
  );
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(prevStart);
  prevEnd.setDate(prevStart.getDate() + elapsedDays);
  return {
    curStart: current.start,
    curEnd: fmtDate(curEndDate),
    prevStart: fmtDate(prevStart),
    prevEnd: fmtDate(prevEnd),
  };
}

/** Short month/period label for comparison column headers. */
function periodShortLabel(isoDate: string, granularity: Granularity): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (granularity === 'monthly') {
    // No year — the selected period already makes the year obvious. Used by
    // both the column sub-headers and the CSV export.
    return d.toLocaleDateString('en-US', { month: 'short' });
  }
  // Week still shows the week-of date so the window is unambiguous.
  return `wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Class for the current-period value when comparison is on: green if it
 * improved vs the previous period, red if it regressed, neutral if unchanged
 * or no prior value. Direction respects each KPI's higherIsBetter.
 */
function improvementClass(
  cur: number,
  prev: number | undefined,
  higherIsBetter: boolean,
  format: (v: number) => string
): string {
  if (prev === undefined || prev === null) return '';
  // If the values render identically at this column's own precision, treat
  // it as no change (covers float noise and the "basically the same" case —
  // a fixed 0.05 threshold would be meaningless across miles vs MPG vs %).
  if (format(cur) === format(prev)) return '';
  const improved = higherIsBetter ? cur > prev : cur < prev;
  return improved
    ? 'text-green-600 dark:text-green-400 font-semibold'
    : 'text-destructive font-semibold';
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);
  return { open, setOpen, ref };
}

function ScoreFormulaPopover() {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" />
        <span>Score formula</span>
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold">Composite Score (0–100)</h3>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            {[
              { label: 'Idle %',       weight: '40%', desc: '0% idle → 100 pts · ≥50% idle → 0 pts (linear). Absorbs idle-fuel waste.' },
              { label: 'MPG vs Fleet', weight: '35%', desc: 'Fleet average earns 60 pts; scaled proportionally' },
              { label: 'Safety',       weight: '25%', desc: 'Per-mile, Motive-weighted event rate (speeding, tailgating, hard brake/corner, stop-sign…)' },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-2">
                <span className="w-20 shrink-0 font-semibold text-foreground">{row.label}</span>
                <span className="w-8 shrink-0 tabular-nums text-primary font-semibold">{row.weight}</span>
                <span className="text-muted-foreground">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnBuilderPopover({
  selectedCols,
  onToggle,
}: {
  selectedCols: ColumnKey[];
  onToggle: (key: ColumnKey) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
          open
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'bg-background text-muted-foreground border-border hover:bg-accent'
        }`}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Columns
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold">Report Columns</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {ALL_COLUMNS.map(col => {
              const isSelected = selectedCols.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => onToggle(col.key)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-primary bg-primary' : 'border-border'
                  }`}>
                    {isSelected && <span className="text-[9px] text-primary-foreground leading-none">✓</span>}
                  </span>
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScorecardPage() {
  const { user } = useUser();
  const colStorageKey = `${COL_STORAGE_PREFIX}_${user?.id ?? 'anon'}`;

  const [pageView, setPageView] = useState<PageView>('scorecard');
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [showComparison, setShowComparison] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('totalMiles');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedCols, setSelectedCols] = useState<ColumnKey[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLS;
    try {
      const stored = localStorage.getItem(`${COL_STORAGE_PREFIX}_anon`);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnKey[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_COLS;
  });

  // Re-load from user-keyed storage once user is known
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(colStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnKey[];
        if (Array.isArray(parsed) && parsed.length > 0) setSelectedCols(parsed);
      }
    } catch { /* ignore */ }
  }, [user?.id, colStorageKey]);

  // Persist column selections
  useEffect(() => {
    try { localStorage.setItem(colStorageKey, JSON.stringify(selectedCols)); } catch { /* ignore */ }
  }, [selectedCols, colStorageKey]);

  function toggleCol(key: ColumnKey) {
    setSelectedCols(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== key);
      }
      // Maintain the order defined in ALL_COLUMNS
      return ALL_COLUMNS.map(c => c.key).filter(k => [...prev, key].includes(k));
    });
  }

  const months = useMemo(generateMonths, []);
  const weeks = useMemo(generateWeeks, []);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    () => months[months.length - 1].key
  );
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(
    () => weeks[weeks.length - 1].key
  );

  const periods = granularity === 'monthly' ? months : weeks;
  const selectedKey = granularity === 'monthly' ? selectedMonthKey : selectedWeekKey;
  const setSelectedKey = granularity === 'monthly' ? setSelectedMonthKey : setSelectedWeekKey;
  const currentPeriod = periods.find(p => p.key === selectedKey) ?? periods[periods.length - 1];

  const cmpRanges = useMemo(
    () => comparisonRanges(currentPeriod, granularity),
    [currentPeriod, granularity]
  );
  const curColLabel = useMemo(
    () => periodShortLabel(cmpRanges.curStart, granularity),
    [cmpRanges.curStart, granularity]
  );
  const prevColLabel = useMemo(
    () => periodShortLabel(cmpRanges.prevStart, granularity),
    [cmpRanges.prevStart, granularity]
  );

  const {
    organization,
    orgLoaded,
    noActiveOrg,
    canShow,
    orgSettingsQuery,
    driverRows,
    months: momMonths,
    monthlyByDriver,
    weeks: momWeeks,
    weeklyByDriver,
    isLoading,
    isRefetching,
  } = useDriversData(currentPeriod.start, currentPeriod.end);

  const { driverRows: prevDriverRows } = useDriversData(cmpRanges.prevStart, cmpRanges.prevEnd, showComparison);

  const prevMap = useMemo(() => {
    const map = new Map<number, DriverRow>();
    prevDriverRows.forEach(r => map.set(r.driverId, r));
    return map;
  }, [prevDriverRows]);

  const sorted = useMemo(() => {
    return [...driverRows].sort((a, b) => {
      const av = a[sortKey as keyof DriverRow] as number | string;
      const bv = b[sortKey as keyof DriverRow] as number | string;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [driverRows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    sortKey === k
      ? <span className="ml-0.5 opacity-70 text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span>
      : null
  );

  const activeCols = ALL_COLUMNS.filter(c => selectedCols.includes(c.key));

  const prevLabel = granularity === 'monthly' ? 'previous month' : 'previous week';

  const handleExportCsv = () => {
    const clean = (raw: string) => (raw === '—' ? '0' : raw);
    const headers = showComparison
      ? [
          'Driver',
          ...activeCols.flatMap(c => [`${c.label} (${prevColLabel})`, `${c.label} (${curColLabel})`]),
          'Score',
        ]
      : ['Driver', ...activeCols.map(c => c.label), 'Score'];
    const rows = sorted.map(row => {
      const prev = showComparison ? prevMap.get(row.driverId) : undefined;
      const cells = showComparison
        ? activeCols.flatMap(c => {
            const pv = prev ? (prev[c.key] as number) : undefined;
            return [
              pv === undefined ? '0' : clean(c.format(pv)),
              clean(c.format(row[c.key] as number)),
            ];
          })
        : activeCols.map(c => clean(c.format(row[c.key] as number)));
      return [row.driverName, ...cells, row.score.toFixed(0)];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const filename = `scorecard-${currentPeriod.label.replace(/\s/g, '-').toLowerCase()}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  if (!orgLoaded) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center px-4 text-muted-foreground">
        <span className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization…
        </span>
      </div>
    );
  }

  if (noActiveOrg) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-foreground">Select an organization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose your organization to load the driver scorecard, or use the switcher in the sidebar.
        </p>
        <div className="mt-8 flex justify-center">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/app/drivers"
            appearance={{
              elements: {
                rootBox: 'inline-flex',
                organizationSwitcherTrigger:
                  'justify-center rounded-md border border-border bg-background px-4 py-2 text-sm',
              },
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-6">
        <Skeleton style={{ height: 300, borderRadius: 8, marginTop: 24 }} />
      </div>
    );
  }

  if (!orgSettingsQuery.isPending && !canShow) {
    return (
      <div className="w-full p-6 pt-8">
        <EmptyState
          title="Driver Data Unavailable"
          description={
            !orgSettingsQuery.data?.tracksDrivers
              ? 'Driver tracking is not enabled for this organization. Enable it in Org Settings.'
              : 'Driver data requires a Motive telematics integration.'
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold leading-none">Driver Scorecard</h1>
              {isRefetching && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating...
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{organization?.name}</p>
          </div>

          <div className="flex items-center gap-2">
            {pageView === 'scorecard' && (
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}

            {/* View toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['scorecard', 'mom', 'sms-preview'] as const).map(v => (
                <button
                  key={v}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0 border-border cursor-pointer ${
                    pageView === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground bg-transparent hover:bg-accent'
                  }`}
                  onClick={() => setPageView(v)}
                >
                  {v === 'scorecard' ? 'Scorecard' : v === 'mom' ? 'Period Trends' : 'Weekly SMS Preview'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 pb-6 flex flex-col gap-4">

        {/* Period controls — only in scorecard view */}
        {pageView === 'scorecard' && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Granularity toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['monthly', 'weekly'] as const).map(g => (
                <button
                  key={g}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0 border-border cursor-pointer ${
                    granularity === g
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground bg-transparent hover:bg-accent'
                  }`}
                  onClick={() => setGranularity(g)}
                >
                  {g === 'monthly' ? 'Month' : 'Week'}
                </button>
              ))}
            </div>

            {/* Period dropdown */}
            <select
              value={selectedKey}
              onChange={e => setSelectedKey(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <optgroup label="Quick">
                {granularity === 'monthly' ? (
                  <>
                    <option value={months[months.length - 1].key}>This Month</option>
                    <option value={months[months.length - 2].key}>Last Month</option>
                  </>
                ) : (
                  <>
                    <option value={weeks[weeks.length - 1].key}>This Week</option>
                    <option value={weeks[weeks.length - 2].key}>Last Week</option>
                  </>
                )}
              </optgroup>
              <optgroup label={granularity === 'monthly' ? 'Specific Month' : 'Specific Week'}>
                {[...periods].reverse().map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </optgroup>
            </select>

            {/* Column builder */}
            <ColumnBuilderPopover selectedCols={selectedCols} onToggle={toggleCol} />

            {/* Comparison toggle — label is always visible; only the switch itself toggles */}
            <div className="flex items-center gap-2 select-none h-9 px-3 rounded-md border border-border bg-background">
              <span className={`text-xs font-medium transition-colors ${showComparison ? 'text-foreground' : 'text-muted-foreground'}`}>
                Compare vs {prevLabel}
              </span>
              <button
                role="switch"
                aria-checked={showComparison}
                onClick={() => setShowComparison(s => !s)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none ${
                  showComparison ? 'bg-primary border-primary' : 'bg-border border-border'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full shadow-sm transition-transform ${
                    showComparison ? 'bg-primary-foreground translate-x-[18px]' : 'bg-foreground/60 translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Content — loading is handled above; keeps MoM / SMS / empty / table split */}
        {pageView === 'sms-preview' ? (
          <SmsPreviewView />
        ) : pageView === 'mom' ? (
          <MonthOverMonthView
            months={momMonths}
            monthlyByDriver={monthlyByDriver}
            weeks={momWeeks}
            weeklyByDriver={weeklyByDriver}
          />
        ) : driverRows.length === 0 ? (
          <EmptyState
            title="No Driver Data"
            description="No records found for this period."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto w-8">#</TableHead>
                  <TableHead
                    className={`text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto cursor-pointer select-none${showComparison ? ' border-r border-border' : ''}`}
                    onClick={() => handleSort('driverName')}
                  >
                    Driver<SortIcon k="driverName" />
                  </TableHead>
                  {activeCols.map(col =>
                    showComparison ? (
                      [
                        <TableHead
                          key={`${col.key}:prev`}
                          className="text-muted-foreground/70 font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto select-none whitespace-nowrap text-right"
                        >
                          {col.shortLabel}
                          <span className="block text-[9px] font-normal normal-case opacity-70">{prevColLabel}</span>
                        </TableHead>,
                        <TableHead
                          key={`${col.key}:cur`}
                          className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto cursor-pointer select-none whitespace-nowrap text-right border-r border-border"
                          onClick={() => handleSort(col.key)}
                        >
                          {col.shortLabel}<SortIcon k={col.key} />
                          <span className="block text-[9px] font-normal normal-case opacity-70">{curColLabel}</span>
                        </TableHead>,
                      ]
                    ) : (
                      <TableHead
                        key={col.key}
                        className="text-muted-foreground font-semibold uppercase tracking-wide text-[10px] px-3 py-2 h-auto cursor-pointer select-none whitespace-nowrap"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.shortLabel}<SortIcon k={col.key} />
                      </TableHead>
                    )
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, idx) => {
                  const prev = showComparison ? prevMap.get(row.driverId) : undefined;
                  return (
                    <TableRow
                      key={row.driverId}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="text-muted-foreground text-[11px] font-mono px-3 py-2">{idx + 1}</TableCell>
                      <TableCell className={`font-semibold text-[12px] px-3 py-2 whitespace-nowrap${showComparison ? ' border-r border-border' : ''}`}>{row.driverName}</TableCell>
                      {activeCols.map(col => {
                        const val = row[col.key] as number;
                        const prevVal = prev ? (prev[col.key] as number) : undefined;
                        if (showComparison) {
                          return [
                            <TableCell
                              key={`${col.key}:prev`}
                              className="text-[12px] px-3 py-2 tabular-nums text-right text-muted-foreground"
                            >
                              {prevVal === undefined ? '—' : col.format(prevVal)}
                            </TableCell>,
                            <TableCell
                              key={`${col.key}:cur`}
                              className={`text-[12px] px-3 py-2 tabular-nums text-right border-r border-border ${improvementClass(val, prevVal, col.higherIsBetter, col.format)}`}
                            >
                              {col.format(val)}
                            </TableCell>,
                          ];
                        }
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-[12px] px-3 py-2 tabular-nums ${col.colorFn ? col.colorFn(val) : ''}`}
                          >
                            {col.format(val)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
