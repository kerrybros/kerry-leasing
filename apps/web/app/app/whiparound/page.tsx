'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ClipboardCheck, AlertCircle, CheckCircle2, Clock, Search, ExternalLink, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

const WHIPAROUND_PAGE_SIZE = 100;

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cols = ['', 'Defect', 'Status', 'Created', 'Asset', 'Team', 'Priority', 'Type', 'Repeated', 'Inspection', 'Assignee'];
  const colCount = cols.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {cols.map((h) => (
              <th
                key={h || 'expand'}
                className={`text-left py-2 font-medium text-muted-foreground whitespace-nowrap ${h ? 'pr-6' : 'w-10 pr-2'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <TableSkeleton cols={colCount} />
          ) : defects.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center text-sm text-muted-foreground">
                No defects match the current filters.
              </td>
            </tr>
          ) : (
            defects.flatMap((d) => {
              const open = expandedId === d.id;
              const mainRow = (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2 pr-2 align-middle">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? 'Collapse details' : 'Expand details'}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                      onClick={() => setExpandedId(open ? null : d.id)}
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                  </td>
                  <td className="py-3 pr-6 font-medium whitespace-nowrap">
                    {d.defectRef ?? `#${d.whiparoundId}`}
                  </td>
                  <td className="py-3 pr-6">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="py-3 pr-6 text-muted-foreground whitespace-nowrap">
                    {formatDate(d.defectCreatedAt)}
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
              );

              if (!open) return [mainRow];

              const ins = d.inspection;
              const detailRow = (
                <tr key={`${d.id}-detail`} className="border-b border-border bg-muted/20">
                  <td colSpan={colCount} className="py-4 px-2 pl-10">
                    <div className="grid gap-3 sm:grid-cols-2 max-w-4xl text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Description</p>
                        <p className="text-foreground whitespace-pre-wrap">{d.description?.trim() || '—'}</p>
                      </div>
                      <div className="space-y-2">
                        <p>
                          <span className="text-muted-foreground">Created: </span>
                          {formatDateTime(d.defectCreatedAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Updated: </span>
                          {formatDateTime(d.defectUpdatedAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Created by: </span>
                          {d.createdBy ?? '—'}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Driver (defect): </span>
                          {d.driverName ?? '—'}
                        </p>
                      </div>
                      <div className="sm:col-span-2 rounded-md border border-border bg-background/50 p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Linked inspection</p>
                        {ins ? (
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
                            <span>
                              <span className="text-muted-foreground">ID </span>
                              <span className="font-mono text-xs">{ins.whiparoundId}</span>
                            </span>
                            <span>
                              <span className="text-muted-foreground">Driver </span>
                              {ins.driverName ?? '—'}
                            </span>
                            <span>
                              <span className="text-muted-foreground">Inspected </span>
                              {formatDateTime(ins.inspectedAt)}
                            </span>
                            <span>
                              <span className="text-muted-foreground">Duration </span>
                              {formatDuration(ins.durationSec)}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-muted-foreground">Result </span>
                              <PassBadge passed={ins.passed} />
                            </span>
                            {ins.pdfUrl ? (
                              <a
                                href={ins.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                Open DVIR PDF <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">No PDF URL</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            No matching inspection in this portal yet (sync inspections, or ID mismatch).
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );

              return [mainRow, detailRow];
            })
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
                  {formatDateTime(ins.inspectedAt)}
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
  const [defectPage, setDefectPage] = useState(0);
  const [inspPage, setInspPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDeferredSearch(val), 300);
  }, []);

  useEffect(() => {
    setDefectPage(0);
  }, [activeStatus, deferredSearch]);

  const defectFilters = useMemo(
    () => ({
      ...(activeStatus ? { status: activeStatus } : {}),
      ...(deferredSearch ? { search: deferredSearch } : {}),
      limit: WHIPAROUND_PAGE_SIZE,
      offset: defectPage * WHIPAROUND_PAGE_SIZE,
    }),
    [activeStatus, deferredSearch, defectPage]
  );

  const inspectionFilters = useMemo(
    () => ({
      limit: WHIPAROUND_PAGE_SIZE,
      offset: inspPage * WHIPAROUND_PAGE_SIZE,
    }),
    [inspPage]
  );

  const { data: defectData, isLoading: defectsLoading } = useWhiparoundDefects(defectFilters);
  const { data: inspData, isLoading: inspLoading } = useWhiparoundInspections(inspectionFilters);
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
              {defectData && defectData.total > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border mt-2">
                  <p className="text-xs text-muted-foreground">
                    Showing {Math.min(defectPage * WHIPAROUND_PAGE_SIZE + 1, defectData.total)}–
                    {Math.min((defectPage + 1) * WHIPAROUND_PAGE_SIZE, defectData.total)} of{' '}
                    {defectData.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={defectPage === 0 || defectsLoading}
                      onClick={() => setDefectPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        defectsLoading ||
                        (defectPage + 1) * WHIPAROUND_PAGE_SIZE >= defectData.total
                      }
                      onClick={() => setDefectPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
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
            {inspData && inspData.total > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border mt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {Math.min(inspPage * WHIPAROUND_PAGE_SIZE + 1, inspData.total)}–
                  {Math.min((inspPage + 1) * WHIPAROUND_PAGE_SIZE, inspData.total)} of{' '}
                  {inspData.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={inspPage === 0 || inspLoading}
                    onClick={() => setInspPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      inspLoading || (inspPage + 1) * WHIPAROUND_PAGE_SIZE >= inspData.total
                    }
                    onClick={() => setInspPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
