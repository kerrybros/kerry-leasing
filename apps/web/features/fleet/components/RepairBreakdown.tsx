'use client';

import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/features/fleet/utils/chartColors';
import { daysJobOpenInclusive, formatYmdForDisplay } from '@/lib/repairJobDaysOpen';

// Types used by repair breakdown and modal (exported for fleet page state)
export type RepairLineSummary = {
  /** complaint_description from repair DB */
  complaint: string | null;
  /** service_description only; may be "" when this line is complaint-only */
  correction: string;
  /**
   * When present from API: true if any source row had "drive up" in complaint, service, or
   * global_service_description (aggregated per line).
   */
  hasDriveUpMention?: boolean;
  component: string | null;
  system: string | null;
  total: number;
  tax: number;
  count: number;
};

export type RepairInvoiceSummary = {
  invoiceNumber: string;
  /** From invoice_date — used for keys, range filter, and sort (not shown as a column) */
  invoiceDate: string;
  orderCreatedDate: string | null;
  /** Latest date_action_completed on the job — order closed (Y-M-D) */
  orderClosedDate: string | null;
  orderNumber: string | null;
  shop: string | null;
  total: number;
  tax: number;
  lineCount: number;
  lines: RepairLineSummary[];
};

export type RepairUnitSummary = {
  unitNumber: string;
  invoiceCount: number;
  total: number;
  tax: number;
  invoices: RepairInvoiceSummary[];
};

export type RepairInvoiceWithUnit = RepairInvoiceSummary & { unitNumber: string };

// Damage detection rule per DESIGN.md
function lineHasContent(line: RepairLineSummary): boolean {
  const hasComplaint = !!(line.complaint && line.complaint.trim() !== '');
  const hasCorrection = !!(line.correction && line.correction.trim() !== '');
  return hasComplaint || hasCorrection;
}

export function isDamageLine(line: RepairLineSummary): boolean {
  return (
    (line.component ?? '').toLowerCase().includes('damage') ||
    (line.system ?? '').toLowerCase().includes('damage')
  );
}

export function isDamageInvoice(inv: RepairInvoiceSummary): boolean {
  return inv.lines.some(isDamageLine);
}

const DRIVE_UP_RE = /drive[\s,-]*up|driveup/;

/** True if complaint, correction (service or fallback global), or API flag indicates a drive-up. */
export function lineMentionsDriveUp(line: RepairLineSummary): boolean {
  if (line.hasDriveUpMention === true) return true;
  for (const raw of [line.complaint, line.correction]) {
    const t = (raw || '').toLowerCase();
    if (t && DRIVE_UP_RE.test(t)) return true;
  }
  return false;
}

/** A job is a drive-up if any line matches {@link lineMentionsDriveUp} (complaint, service, or global). */
export function isDriveUpInvoice(inv: RepairInvoiceSummary): boolean {
  return inv.lines.some(lineMentionsDriveUp);
}

function RepairDetailsModal({
  invoice,
  onClose,
}: {
  invoice: RepairInvoiceWithUnit | null;
  onClose: () => void;
}) {
  if (!invoice) return null;

  const daysOpen = daysJobOpenInclusive(invoice.orderCreatedDate, invoice.orderClosedDate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-foreground/15 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl w-full max-w-[min(70rem,96vw)] max-h-[90vh] overflow-hidden flex flex-col border border-border/80 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.2)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-primary/15 flex justify-between items-start gap-3 bg-gradient-to-r from-primary/[0.09] to-muted/50">
          <div>
            <h3 className="text-lg font-bold text-foreground">Repair Details</h3>
            <div className="text-sm text-muted-foreground mt-1.5 space-y-1">
              <div>
                Unit: <span className="font-semibold text-foreground">{invoice.unitNumber}</span>
              </div>
              <div>
                Order created date:{' '}
                <span className="font-medium text-foreground">
                  {formatYmdForDisplay(invoice.orderCreatedDate)}
                </span>
              </div>
              <div>
                Order closed date:{' '}
                <span className="font-medium text-foreground">
                  {formatYmdForDisplay(invoice.orderClosedDate)}
                </span>
              </div>
              <div>
                Days open:{' '}
                <span className="font-medium text-foreground">{daysOpen != null ? daysOpen : '—'}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 border border-transparent hover:border-border/80 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 sm:p-6 overflow-y-auto bg-gradient-to-b from-muted/25 via-card to-card">
          <h4 className="text-xs font-bold text-primary/85 uppercase tracking-widest mb-4 px-0.5">Service lines</h4>
          <div className="space-y-4">
            {invoice.lines
              .filter((line: RepairLineSummary) => lineHasContent(line))
              .map((line: RepairLineSummary, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-xl border overflow-hidden flex flex-col ${
                    isDamageLine(line)
                      ? 'border-destructive/35 bg-destructive/[0.04] shadow-sm'
                      : 'border-border/70 bg-card shadow-sm'
                  }`}
                >
                  <div
                    className={
                      isDamageLine(line)
                        ? 'flex items-center justify-between gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20'
                        : 'flex items-center justify-between gap-2 px-3 py-1.5 bg-primary/12 border-b border-primary/20'
                    }
                  >
                    <span
                      className={
                        isDamageLine(line)
                          ? 'text-xs font-bold uppercase tracking-wide text-destructive'
                          : 'text-xs font-bold uppercase tracking-wide text-primary'
                      }
                    >
                      complaint
                    </span>
                    {isDamageLine(line) && <Badge variant="destructive" className="shrink-0 text-[10px]">Damage</Badge>}
                  </div>
                  <div
                    className={
                      isDamageLine(line)
                        ? 'px-3.5 py-3 text-sm text-foreground/95 leading-relaxed break-words bg-destructive/[0.03]'
                        : 'px-3.5 py-3 text-sm text-foreground/95 leading-relaxed break-words bg-primary/[0.04]'
                    }
                  >
                    {line.complaint?.trim() ? line.complaint : '—'}
                  </div>
                  <div
                    className={
                      isDamageLine(line)
                        ? 'flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-t border-destructive/20 border-b border-destructive/20'
                        : 'flex items-center gap-2 px-3 py-1.5 bg-primary/12 border-t border-primary/20 border-b border-primary/20'
                    }
                  >
                    <span
                      className={
                        isDamageLine(line)
                          ? 'text-xs font-bold uppercase tracking-wide text-destructive'
                          : 'text-xs font-bold uppercase tracking-wide text-primary'
                      }
                    >
                      correction
                    </span>
                  </div>
                  <div
                    className={
                      isDamageLine(line)
                        ? 'px-3.5 py-3 text-sm font-medium text-foreground/95 leading-relaxed break-words bg-destructive/[0.03]'
                        : 'px-3.5 py-3 text-sm font-medium text-foreground/95 leading-relaxed break-words bg-primary/[0.04]'
                    }
                  >
                    {line.correction?.trim() ? line.correction : '—'}
                  </div>
                  <div className="px-3.5 py-2.5 text-xs text-muted-foreground bg-background/50 border-t border-border/40">
                    <span className="font-medium text-foreground/70">Component / system</span>
                    <span className="mx-2 text-border/80">·</span>
                    {line.component || 'N/A'} / {line.system || 'N/A'}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="p-4 border-t border-border/70 bg-muted/40 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function RepairBreakdown({
  units,
  loading,
  error,
  startDate,
  endDate,
  onUnitSelect,
}: {
  units: RepairUnitSummary[];
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  onUnitSelect?: (unit: string | null) => void;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<RepairInvoiceWithUnit | null>(null);
  const [selectedMatrixUnit, setSelectedMatrixUnit] = useState<string | null>(null);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');
  const [jobsSortKey, setJobsSortKey] = useState<'unit' | 'count' | 'osDays' | 'driveUpCount' | 'damageCount'>('unit');
  const [jobsSortDir, setJobsSortDir] = useState<'asc' | 'desc'>('asc');
  const [repairsSortKey, setRepairsSortKey] = useState<'orderCreated' | 'orderClosed' | 'daysOos' | 'unit'>('orderCreated');
  const [repairsSortDir, setRepairsSortDir] = useState<'asc' | 'desc'>('desc');

  const dateFilteredUnits = useMemo(() => {
    return units
      .map(u => {
        const invoices = u.invoices.filter(inv => {
          if (!inv.invoiceDate) return false;
          return inv.invoiceDate >= startDate && inv.invoiceDate <= endDate;
        });
        const total = invoices.reduce((sum, inv) => sum + inv.total, 0);
        const tax = invoices.reduce((sum, inv) => sum + inv.tax, 0);
        return {
          ...u,
          invoices,
          invoiceCount: invoices.length,
          total: Number(total.toFixed(2)),
          tax: Number(tax.toFixed(2)),
        };
      })
      .filter(u => u.invoices.length > 0);
  }, [units, startDate, endDate]);

  const filteredUnits = useMemo(() => {
    const q = unitSearchQuery.trim().toLowerCase();
    if (!q) return dateFilteredUnits;
    return dateFilteredUnits.filter(u => u.unitNumber.toLowerCase().includes(q));
  }, [dateFilteredUnits, unitSearchQuery]);

  const repairsList = useMemo((): RepairInvoiceWithUnit[] => {
    let source = filteredUnits;
    if (selectedMatrixUnit) {
      source = filteredUnits.filter(u => u.unitNumber === selectedMatrixUnit);
    }
    return source.flatMap(u =>
      u.invoices.map(inv => ({
        unitNumber: u.unitNumber,
        ...inv,
      }))
    );
  }, [filteredUnits, selectedMatrixUnit]);

  const invoices = useMemo(() => {
    /** Missing / invalid Y-M-D sorts after real dates in ascending order, before in descending. */
    const ymd = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '9999-12-31');
    const daysOrNull = (inv: RepairInvoiceWithUnit) => daysJobOpenInclusive(inv.orderCreatedDate, inv.orderClosedDate);

    const rows = [...repairsList];
    rows.sort((a, b) => {
      if (repairsSortKey === 'orderCreated') {
        if (repairsSortDir === 'asc') {
          return ymd(a.orderCreatedDate).localeCompare(ymd(b.orderCreatedDate));
        }
        return ymd(b.orderCreatedDate).localeCompare(ymd(a.orderCreatedDate));
      }
      if (repairsSortKey === 'orderClosed') {
        if (repairsSortDir === 'asc') {
          return ymd(a.orderClosedDate).localeCompare(ymd(b.orderClosedDate));
        }
        return ymd(b.orderClosedDate).localeCompare(ymd(a.orderClosedDate));
      }
      if (repairsSortKey === 'daysOos') {
        const da = daysOrNull(a);
        const db = daysOrNull(b);
        if (da == null && db == null) return 0;
        if (da == null) return 1; // a (no days) after b
        if (db == null) return -1; // b (no days) after a
        if (repairsSortDir === 'asc') {
          return da - db;
        }
        return db - da;
      }
      const u = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
      return repairsSortDir === 'asc' ? u : -u;
    });
    return rows;
  }, [repairsList, repairsSortKey, repairsSortDir]);

  const handleRepairsSort = (key: 'orderCreated' | 'orderClosed' | 'daysOos' | 'unit') => {
    if (repairsSortKey === key) setRepairsSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setRepairsSortKey(key);
      setRepairsSortDir(key === 'unit' ? 'asc' : 'desc');
    }
  };

  const jobsData = useMemo(() => {
    const data: {
      unitNumber: string;
      count: number;
      osDays: number;
      driveUpCount: number;
      damageCount: number;
    }[] = [];
    let grandTotal = 0;
    let grandOs = 0;
    let grandDriveUp = 0;
    let grandDamage = 0;
    dateFilteredUnits.forEach(u => {
      const orders = new Set<string>();
      const damageOrders = new Set<string>();
      const driveUpOrders = new Set<string>();
      let osDays = 0;
      u.invoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        orders.add(jobId);
        if (isDamageInvoice(inv)) damageOrders.add(jobId);
        if (isDriveUpInvoice(inv)) driveUpOrders.add(jobId);
        const d = daysJobOpenInclusive(inv.orderCreatedDate, inv.orderClosedDate);
        if (d != null) osDays += d;
      });
      const count = orders.size;
      const damageCount = damageOrders.size;
      const driveUpCount = driveUpOrders.size;
      grandTotal += count;
      grandOs += osDays;
      grandDriveUp += driveUpCount;
      grandDamage += damageCount;
      if (count > 0) {
        data.push({ unitNumber: u.unitNumber, count, osDays, driveUpCount, damageCount });
      }
    });
    data.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
    return { rows: data, grandTotal, grandOs, grandDriveUp, grandDamage };
  }, [dateFilteredUnits]);

  const sortedJobRows = useMemo(() => {
    const rows = [...jobsData.rows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (jobsSortKey === 'unit') cmp = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
      else if (jobsSortKey === 'count') cmp = a.count - b.count;
      else if (jobsSortKey === 'osDays') cmp = a.osDays - b.osDays;
      else if (jobsSortKey === 'driveUpCount') cmp = a.driveUpCount - b.driveUpCount;
      else cmp = a.damageCount - b.damageCount;
      return jobsSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [jobsData.rows, jobsSortKey, jobsSortDir]);

  const handleJobsSort = (key: 'unit' | 'count' | 'osDays' | 'driveUpCount' | 'damageCount') => {
    if (jobsSortKey === key) setJobsSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setJobsSortKey(key); setJobsSortDir(key === 'unit' ? 'asc' : 'desc'); }
  };

  // Source for charts — respects the selected unit filter
  const chartSourceUnits = useMemo(() => {
    if (!selectedMatrixUnit) return dateFilteredUnits;
    return dateFilteredUnits.filter(u => u.unitNumber === selectedMatrixUnit);
  }, [dateFilteredUnits, selectedMatrixUnit]);

  // Component/System breakdown data
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; isDamage: boolean }>();
    chartSourceUnits.forEach(u => {
      u.invoices.forEach(inv => {
        inv.lines.forEach(line => {
          if (!line.component && !line.system) return;
          const key = `${line.component || '?'} / ${line.system || '?'}`;
          const existing = map.get(key) || { count: 0, isDamage: false };
          existing.count += 1;
          if (isDamageLine(line)) existing.isDamage = true;
          map.set(key, existing);
        });
      });
    });
    return Array.from(map.entries())
      .map(([category, { count, isDamage }]) => ({ category, count, isDamage }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [chartSourceUnits]);

  // Repair frequency trend (jobs per month)
  const repairTrend = useMemo(() => {
    const monthMap = new Map<string, number>();
    chartSourceUnits.forEach(u => {
      const seen = new Set<string>();
      u.invoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        if (seen.has(jobId)) return;
        seen.add(jobId);
        const monthKey = inv.invoiceDate.substring(0, 7);
        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
      });
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, count]) => {
        const [year, month] = monthKey.split('-');
        const label = new Date(parseInt(year), parseInt(month) - 1)
          .toLocaleString('default', { month: 'short', year: '2-digit' });
        return { month: label, count };
      });
  }, [chartSourceUnits]);

  const handleMatrixClick = (unitNumber: string) => {
    const next = selectedMatrixUnit === unitNumber ? null : unitNumber;
    setSelectedMatrixUnit(next);
    onUnitSelect?.(next ? next.split(' - ')[0] : null);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton style={{ height: 44, borderRadius: 8 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 220, borderRadius: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
          <div className="font-bold mb-1">Failed to load repair data</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Main two-panel layout: wider jobs table, condensed repairs; footer outside scroll to avoid overlap */}
      <div className="flex h-[min(28rem,70vh)] min-h-0 max-w-full gap-4">
        {/* LEFT: job counts + Days OOS aggregate — same shell as chart cards (ring) */}
        <div className="flex w-[27.5rem] min-w-[25rem] max-w-[32rem] shrink-0 flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-primary/20">
          <div className="shrink-0 border-b border-primary/20 bg-gradient-to-b from-primary/[0.13] to-muted/25 px-2 py-1.5 text-center">
            <span className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground">Number of jobs</span>
          </div>
          <div className="min-h-0 flex flex-1 flex-col">
            {/*
              Normal <table> inside one scroll area — the block+scrollable <tbody> pattern breaks
              table-fixed and colgroup widths. Sticky header/footer keep UX without a second table.
            */}
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr className="sticky top-0 z-20 border-b-2 border-b-primary/25 bg-muted text-foreground shadow-sm">
                    {(
                      [
                        ['unit', 'Unit'],
                        ['count', 'Number of jobs'],
                        ['osDays', 'Days OOS'],
                        ['driveUpCount', 'Drive up'],
                        ['damageCount', 'Damage'],
                      ] as const
                    ).map(([key, label], idx) => {
                      const isActive = jobsSortKey === key;
                      return (
                        <th
                          key={key}
                          onClick={() => handleJobsSort(key)}
                          className={[
                            'bg-muted px-1.5 py-1.5 text-center text-[0.55rem] font-semibold uppercase leading-tight',
                            idx < 4 ? 'border-r border-border/60' : '',
                            'cursor-pointer select-none',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="inline-flex items-center justify-center gap-0.5">
                            {label}
                            {isActive && (
                              <span className="text-primary text-[0.5rem] leading-none">
                                {jobsSortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedJobRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">
                        No data
                      </td>
                    </tr>
                  ) : (
                    sortedJobRows.map((row) => (
                        <tr
                          key={row.unitNumber}
                          onClick={() => handleMatrixClick(row.unitNumber)}
                          style={{
                            cursor: 'pointer',
                            background: selectedMatrixUnit === row.unitNumber ? 'var(--accent)' : undefined,
                            borderLeft: selectedMatrixUnit === row.unitNumber ? '2px solid var(--primary)' : '2px solid transparent',
                          }}
                          className="bg-card hover:bg-accent/30"
                        >
                          <td className="border-b border-border/80 border-r border-r-border/80 py-1 px-1.5 text-center font-bold tabular-nums">
                          {row.unitNumber.split(' - ')[0]}
                        </td>
                        <td className="border-b border-border/80 border-r border-r-border/80 py-1 px-1 text-center font-bold tabular-nums [font-size:0.65rem] leading-tight">
                          {row.count}
                        </td>
                        <td className="border-b border-border/80 border-r border-r-border/80 py-1 px-0.5 text-center font-semibold tabular-nums text-foreground">
                          {row.osDays > 0 ? row.osDays.toLocaleString() : '—'}
                        </td>
                        <td className="border-b border-border/80 border-r border-r-border/80 py-1 px-0.5 text-center font-semibold tabular-nums text-foreground">
                          {row.driveUpCount > 0 ? row.driveUpCount.toLocaleString() : '—'}
                        </td>
                        <td className="border-b border-border/80 py-1 px-0.5 text-center">
                          {row.damageCount > 0 ? (
                            <span className="text-destructive font-semibold tabular-nums">{row.damageCount}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="text-foreground">
                  <tr className="sticky bottom-0 z-10 border-t-2 border-primary/25 bg-muted shadow-[0_-2px_6px_rgba(0,0,0,0.05)]">
                    <td className="border-r border-border/80 bg-muted py-1.5 px-1.5 text-center text-[0.7rem] font-bold">Total</td>
                    <td className="border-r border-border/80 bg-muted py-1.5 px-1 text-center text-[0.7rem] font-bold tabular-nums">
                      {jobsData.grandTotal}
                    </td>
                    <td className="border-r border-border/80 bg-muted py-1.5 px-0.5 text-center text-[0.7rem] font-bold tabular-nums">
                      {jobsData.grandOs > 0 ? jobsData.grandOs.toLocaleString() : '—'}
                    </td>
                    <td className="border-r border-border/80 bg-muted py-1.5 px-0.5 text-center text-[0.7rem] font-bold tabular-nums">
                      {jobsData.grandDriveUp > 0 ? jobsData.grandDriveUp.toLocaleString() : '—'}
                    </td>
                    <td className="bg-muted py-1.5 px-0.5 text-center text-[0.7rem]">
                      <span className={jobsData.grandDamage > 0 ? 'font-bold text-destructive' : 'text-muted-foreground'}>
                        {jobsData.grandDamage > 0 ? jobsData.grandDamage : '—'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: repair lines — full width, no side inset; ring matches chart cards */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-primary/20">
          <div className="shrink-0 border-b border-primary/20 bg-gradient-to-b from-primary/[0.13] to-muted/25 px-2 py-1.5">
            <div className="flex items-center justify-center relative pr-14 min-h-[1.1rem]">
              <span className="text-center text-[0.7rem] font-bold uppercase tracking-wide text-foreground">
                {selectedMatrixUnit
                  ? `Repairs · Unit ${selectedMatrixUnit.split(' - ')[0]}`
                  : 'Repairs'}
              </span>
              <span className="text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 tabular-nums text-[0.65rem]">
                {invoices.length}
              </span>
            </div>
          </div>
          <div className="shrink-0 border-b border-border/80 bg-muted/25 px-2 py-1.5">
            <div className="flex w-full min-w-0 gap-2">
              <input
                type="text"
                placeholder="Search unit…"
                value={unitSearchQuery}
                onChange={(e) => setUnitSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {selectedMatrixUnit && (
                <button
                  type="button"
                  onClick={() => setSelectedMatrixUnit(null)}
                  className="shrink-0 rounded border border-border bg-background px-2 py-1 text-[0.65rem] font-medium text-foreground hover:bg-accent"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table
                className="w-full min-w-0 table-fixed border-collapse text-xs [&_th]:px-0.5 [&_th]:py-1.5 [&_th:first-child]:pl-1.5 [&_th:last-child]:pr-1.5 [&_td]:px-0.5 [&_td]:py-1 [&_td:first-child]:pl-1.5 [&_td:last-child]:pr-1.5"
              >
                <colgroup>
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr className="sticky top-0 z-20 border-b-2 border-b-primary/25 bg-muted text-foreground shadow-sm">
                    {(
                      [
                        ['orderCreated', 'Order created'],
                        ['orderClosed', 'Order closed'],
                        ['daysOos', 'Days OOS'],
                        ['unit', 'Unit'],
                      ] as const
                    ).map(([key, label]) => {
                      const isActive = repairsSortKey === key;
                      return (
                        <th
                          key={key}
                          onClick={() => handleRepairsSort(key)}
                          className="cursor-pointer select-none border-r border-border/60 bg-muted text-center text-[0.55rem] font-semibold uppercase leading-tight"
                        >
                          <span className="inline-flex items-center justify-center gap-0.5">
                            {label}
                            {isActive && (
                              <span className="text-primary text-[0.5rem] leading-none">
                                {repairsSortDir === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                    <th className="bg-muted text-center text-[0.55rem] font-semibold uppercase leading-tight">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                        {units.length === 0 ? 'No repair data available' : 'No invoices found for selected filters'}
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const unitNum = inv.unitNumber.split(' - ')[0];
                      const openDays = daysJobOpenInclusive(inv.orderCreatedDate, inv.orderClosedDate);
                      return (
                        <tr
                          key={`${inv.unitNumber}-${inv.invoiceNumber}-${inv.invoiceDate}`}
                          style={{ fontSize: 12 }}
                          className="bg-card hover:bg-accent/30"
                        >
                          <td className="border-b border-border/80 border-r border-r-border/80 text-center tabular-nums whitespace-nowrap">
                            {formatYmdForDisplay(inv.orderCreatedDate)}
                          </td>
                          <td className="border-b border-border/80 border-r border-r-border/80 text-center tabular-nums whitespace-nowrap">
                            {formatYmdForDisplay(inv.orderClosedDate)}
                          </td>
                          <td className="border-b border-border/80 border-r border-r-border/80 text-center tabular-nums text-[0.7rem] whitespace-nowrap">
                            {openDays != null ? openDays : '—'}
                          </td>
                          <td className="border-b border-border/80 border-r border-r-border/80 text-center font-bold tabular-nums whitespace-nowrap">
                            {unitNum}
                          </td>
                          <td className="border-b border-border/80 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(inv)}
                              className="inline-flex max-w-full justify-center text-balance rounded border border-primary/25 bg-primary/5 px-1.5 py-1 text-center text-[0.58rem] font-medium leading-snug text-primary hover:bg-primary/10"
                            >
                              See Repair Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
          </div>
        </div>
      </div>

      {/* Component/System Breakdown + Repair Frequency Trend */}
      {categoryBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Component/System Breakdown Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Component / System Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
            <div style={{ height: Math.max(260, categoryBreakdown.length * 26 + 20) }} className="[&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBreakdown}
                  layout="vertical"
                  margin={{ top: 2, right: 44, left: 4, bottom: 2 }}
                >
                  <XAxis
                    type="number"
                    stroke={CHART_COLORS.axis}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_COLORS.tick }}
                    width={60}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={210}
                    stroke={CHART_COLORS.axis}
                    fontSize={9.5}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_COLORS.tick }}
                    tickFormatter={(v: string) => v.length > 34 ? v.slice(0, 33) + '…' : v}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), 'Line Items']}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                    fill={CHART_COLORS.primary}
                    barSize={13}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.isDamage || entry.category.toLowerCase().includes('damage')
                            ? '#ef4444'
                            : CHART_COLORS.primary
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{ fill: CHART_COLORS.tick, fontSize: 10 }}
                      formatter={(value: unknown) => (value as number).toLocaleString()}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3 mt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: CHART_COLORS.primary }}></span>
                Standard
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#ef4444]"></span>
                Damage-flagged
              </span>
            </div>
            </CardContent>
          </Card>

          {/* Repair Frequency Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Repair Jobs per Month
              </CardTitle>
            </CardHeader>
            <CardContent>
            <div style={{ height: 340 }} className="[&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={repairTrend} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke={CHART_COLORS.axis}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_COLORS.tick }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axis}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    tick={{ fill: CHART_COLORS.tick }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [Number(value).toLocaleString(), 'Jobs']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={4}
                    dot={{ fill: CHART_COLORS.primary, r: 5, strokeWidth: 0 }}
                    activeDot={{ r: 7 }}
                  >
                    <LabelList
                      dataKey="count"
                      position="top"
                      offset={10}
                      style={{ fill: CHART_COLORS.tick, fontSize: 11, fontWeight: 600 }}
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedInvoice && (
        <RepairDetailsModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
