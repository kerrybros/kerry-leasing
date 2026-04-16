'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { ClipboardCheck, AlertCircle, CheckCircle2, Clock, Search, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/Skeleton';
import {
  useWhiparoundDefects,
  useWhiparoundInspections,
  useWhiparoundSyncStatus,
  type WhiparoundDefect,
  type WhiparoundInspection,
} from '@/hooks/useDataQueries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: {
    label: 'New',
    className: 'bg-muted text-muted-foreground border border-border',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  },
  corrected: {
    label: 'Corrected',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  no_correction_needed: {
    label: 'No Correction',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

function StatusBadge({ status }: { status: string | null }) {
  const key = status?.toLowerCase() ?? '';
  const cfg = STATUS_CONFIG[key] ?? { label: status ?? '—', className: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed === true)
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" /> Pass
      </span>
    );
  if (passed === false)
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        <AlertCircle className="h-3 w-3" /> Fail
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
      <Clock className="h-3 w-3" /> —
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'corrected', label: 'Corrected' },
  { key: 'no_correction_needed', label: 'No Correction Needed' },
] as const;

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function TableSkeleton({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="py-3 pr-6">
              <Skeleton className="h-4 w-full rounded" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Defects table
// ---------------------------------------------------------------------------

function DefectsTable({
  defects,
  isLoading,
}: {
  defects: WhiparoundDefect[];
  isLoading: boolean;
}) {
  const cols = ['Defect', 'Status', 'Asset', 'Team', 'Priority', 'Type', 'Repeated', 'Inspection', 'Assignee'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {cols.map((h) => (
              <th key={h} className="text-left py-2 font-medium text-muted-foreground whitespace-nowrap pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeleton cols={cols.length} />
          ) : defects.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="py-12 text-center text-sm text-muted-foreground">
                No defects match the current filters.
              </td>
            </tr>
          ) : (
            defects.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-3 pr-6 font-medium whitespace-nowrap">
                  {d.defectRef ?? `#${d.whiparoundId}`}
                </td>
                <td className="py-3 pr-6">
                  <StatusBadge status={d.status} />
                </td>
                <td className="py-3 pr-6 font-medium">{d.assetName ?? '—'}</td>
                <td className="py-3 pr-6 text-muted-foreground">{d.teamName ?? '—'}</td>
                <td className="py-3 pr-6 text-muted-foreground">{d.defectPriority ?? 'Undefined'}</td>
                <td className="py-3 pr-6 text-muted-foreground">{d.defectType ?? '—'}</td>
                <td className="py-3 pr-6 text-center text-muted-foreground">{d.repeatedTimes ?? 0}</td>
                <td className="py-3 pr-6 text-muted-foreground">
                  {d.inspectionId ? (
                    <span className="font-mono text-xs text-primary">{d.inspectionId}</span>
                  ) : '—'}
                </td>
                <td className="py-3 pr-6 text-muted-foreground">{d.assignee ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspections table
// ---------------------------------------------------------------------------

function InspectionsTable({
  inspections,
  isLoading,
}: {
  inspections: WhiparoundInspection[];
  isLoading: boolean;
}) {
  const cols = ['Inspection ID', 'Driver', 'Asset', 'Date', 'Duration', 'Result', 'PDF'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {cols.map((h) => (
              <th key={h} className="text-left py-2 font-medium text-muted-foreground whitespace-nowrap pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeleton cols={cols.length} />
          ) : inspections.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="py-12 text-center text-sm text-muted-foreground">
                No inspections found.
              </td>
            </tr>
          ) : (
            inspections.map((ins) => (
              <tr key={ins.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-3 pr-6 font-mono text-xs text-primary">{ins.whiparoundId}</td>
                <td className="py-3 pr-6">{ins.driverName ?? '—'}</td>
                <td className="py-3 pr-6 font-medium">{ins.assetId ?? '—'}</td>
                <td className="py-3 pr-6 text-muted-foreground whitespace-nowrap">
                  {formatDate(ins.inspectedAt)}
                </td>
                <td className="py-3 pr-6 text-muted-foreground">{formatDuration(ins.durationSec)}</td>
                <td className="py-3 pr-6">
                  <PassBadge passed={ins.passed} />
                </td>
                <td className="py-3 pr-6">
                  {ins.pdfUrl ? (
                    <a
                      href={ins.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      PDF <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WhiparoundPage() {
  const [activeStatus, setActiveStatus] = useState('');
  const [search, setSearch] = useState('');
  const [deferredSearch, setDeferredSearch] = useState('');
  const [view, setView] = useState<'defects' | 'inspections'>('defects');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDeferredSearch(val), 300);
  }, []);

  const defectFilters = useMemo(
    () => ({
      ...(activeStatus ? { status: activeStatus } : {}),
      ...(deferredSearch ? { search: deferredSearch } : {}),
    }),
    [activeStatus, deferredSearch]
  );

  const { data: defectData, isLoading: defectsLoading } = useWhiparoundDefects(defectFilters);
  const { data: inspData, isLoading: inspLoading } = useWhiparoundInspections();
  const { data: syncStatus } = useWhiparoundSyncStatus();

  const statusCounts = defectData?.statusCounts ?? {};
  const defects = defectData?.defects ?? [];
  const inspections = inspData?.inspections ?? [];

  const notConfigured = syncStatus && !syncStatus.configured;

  return (
    <div className="mx-auto px-4 py-8 max-w-7xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-1">Whiparound</h1>
          <p className="text-sm text-muted-foreground">
            Pre &amp; post-trip DVIR inspections and defects across your fleet.
          </p>
        </div>
        {syncStatus?.configured && (
          <p className="text-xs text-muted-foreground mt-1.5 shrink-0">
            Last synced: {formatRelativeTime(syncStatus.lastSyncAt)}
          </p>
        )}
      </div>

      {/* Not configured banner */}
      {notConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Whiparound is not configured for this organization. Contact your administrator to set up the API key.
        </div>
      )}

      {/* Sync error banner */}
      {syncStatus?.lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Last sync error: {syncStatus.lastError}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('defects')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'defects'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Defects
        </button>
        <button
          onClick={() => setView('inspections')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'inspections'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Inspections
        </button>
      </div>

      {view === 'defects' && (
        <>
          {/* Status tabs */}
          <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
            {STATUS_TABS.map((tab) => {
              const count = tab.key === '' ? (statusCounts.all ?? 0) : (statusCounts[tab.key] ?? 0);
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStatus === tab.key
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search defect, asset, description…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Defects table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>
                  {activeStatus
                    ? STATUS_TABS.find((t) => t.key === activeStatus)?.label
                    : 'All Defects'}
                </span>
                {defectData && (
                  <span className="text-xs text-muted-foreground font-normal">
                    {defectData.total} total
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DefectsTable defects={defects} isLoading={defectsLoading} />
            </CardContent>
          </Card>
        </>
      )}

      {view === 'inspections' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>All Inspections</span>
              {inspData && (
                <span className="text-xs text-muted-foreground font-normal">
                  {inspData.total} total
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InspectionsTable inspections={inspections} isLoading={inspLoading} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
