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

// Types used by repair breakdown and modal (exported for fleet page state)
export type RepairLineSummary = {
  description: string;
  component: string | null;
  system: string | null;
  total: number;
  tax: number;
  count: number;
};

export type RepairInvoiceSummary = {
  invoiceNumber: string;
  invoiceDate: string;
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
export function isDamageLine(line: RepairLineSummary): boolean {
  return (
    (line.component ?? '').toLowerCase().includes('damage') ||
    (line.system ?? '').toLowerCase().includes('damage')
  );
}

export function isDamageInvoice(inv: RepairInvoiceSummary): boolean {
  return inv.lines.some(isDamageLine);
}


function RepairDetailsModal({
  invoice,
  onClose,
}: {
  invoice: RepairInvoiceWithUnit | null;
  onClose: () => void;
}) {
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted">
          <div>
            <h3 className="text-lg font-bold">Repair Details</h3>
            <div className="text-sm text-muted-foreground mt-1">
              Unit: <span className="font-semibold text-foreground">{invoice.unitNumber}</span>
              {' '}• Repair Completed Date: {new Date(invoice.invoiceDate).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto bg-card">
          <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Service Lines</h4>
          <div className="space-y-3">
            {invoice.lines
              .filter((line: RepairLineSummary) => line.description && line.description !== '(No description)')
              .map((line: RepairLineSummary, idx: number) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border flex flex-col gap-1 ${
                    isDamageLine(line)
                      ? 'bg-destructive/5 border-destructive/30'
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{line.description}</span>
                    {isDamageLine(line) && (
                      <Badge variant="destructive">Damage</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {line.component || 'N/A'} / {line.system || 'N/A'}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="p-4 border-t border-border bg-muted flex justify-end">
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
  const [jobsSortKey, setJobsSortKey] = useState<'unit' | 'count' | 'damageCount'>('unit');
  const [jobsSortDir, setJobsSortDir] = useState<'asc' | 'desc'>('asc');

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

  const invoices = useMemo(() => {
    let source = filteredUnits;
    if (selectedMatrixUnit) {
      source = filteredUnits.filter(u => u.unitNumber === selectedMatrixUnit);
    }
    return source
      .flatMap(u =>
        u.invoices.map(inv => ({
          unitNumber: u.unitNumber,
          ...inv,
        }))
      )
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }, [filteredUnits, selectedMatrixUnit]);

  const jobsData = useMemo(() => {
    const data: { unitNumber: string; count: number; damageCount: number }[] = [];
    let grandTotal = 0;
    let grandDamage = 0;
    dateFilteredUnits.forEach(u => {
      const orders = new Set<string>();
      const damageOrders = new Set<string>();
      u.invoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        orders.add(jobId);
        if (isDamageInvoice(inv)) damageOrders.add(jobId);
      });
      const count = orders.size;
      const damageCount = damageOrders.size;
      grandTotal += count;
      grandDamage += damageCount;
      if (count > 0) {
        data.push({ unitNumber: u.unitNumber, count, damageCount });
      }
    });
    data.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
    return { rows: data, grandTotal, grandDamage };
  }, [dateFilteredUnits]);

  const sortedJobRows = useMemo(() => {
    const rows = [...jobsData.rows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (jobsSortKey === 'unit') cmp = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
      else if (jobsSortKey === 'count') cmp = a.count - b.count;
      else cmp = a.damageCount - b.damageCount;
      return jobsSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [jobsData.rows, jobsSortKey, jobsSortDir]);

  const handleJobsSort = (key: 'unit' | 'count' | 'damageCount') => {
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

      {/* Main two-panel layout */}
      <div style={{ display: 'flex', gap: 16, height: 480 }}>
        {/* LEFT: Unit job count list */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 6 }} className="bg-card border border-border">
          <div className="bg-muted text-foreground border-b border-border" style={{ padding: '8px 0 6px', flexShrink: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Number of Jobs Done
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-muted text-foreground sticky top-0 z-[2]">
                  {(['unit', 'count', 'damageCount'] as const).map((key, idx) => {
                    const labels = ['Unit', 'Jobs', 'Damage'];
                    const widths = [undefined, 60, 80];
                    const isActive = jobsSortKey === key;
                    return (
                      <th
                        key={key}
                        onClick={() => handleJobsSort(key)}
                        className={`border-b border-border ${idx < 2 ? 'border-r border-r-border' : ''} ${key === 'damageCount' ? 'text-destructive' : ''} select-none`}
                        style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px', width: widths[idx], cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                          {labels[idx]}
                          {isActive && <span style={{ fontSize: 9, lineHeight: 1 }}>{jobsSortDir === 'asc' ? '▲' : '▼'}</span>}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedJobRows.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, fontSize: 12 }} className="text-muted-foreground">No data</td></tr>
                ) : (
                  sortedJobRows.map((row) => (
                    <tr
                      key={row.unitNumber}
                      onClick={() => handleMatrixClick(row.unitNumber)}
                      style={{
                        cursor: 'pointer',
                        fontSize: 12,
                        background: selectedMatrixUnit === row.unitNumber ? 'var(--accent)' : undefined,
                        borderLeft: selectedMatrixUnit === row.unitNumber ? '3px solid var(--primary)' : '3px solid transparent',
                      }}
                      className="hover:bg-accent/30"
                    >
                      <td className="border-b border-border border-r border-r-border" style={{ padding: '3px 8px', fontWeight: 700 }}>{row.unitNumber.split(' - ')[0]}</td>
                      <td className="border-b border-border border-r border-r-border" style={{ padding: '3px 8px', fontWeight: 700, textAlign: 'center', width: 60 }}>{row.count}</td>
                      <td className="border-b border-border" style={{ padding: '3px 8px', textAlign: 'center', width: 80 }}>
                        {row.damageCount > 0 ? (
                          <span className="text-destructive" style={{ fontWeight: 600 }}>{row.damageCount}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted text-foreground sticky bottom-0 z-[2]">
                  <td className="border-t border-border border-r border-r-border" style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12 }}>Total</td>
                  <td className="border-t border-border border-r border-r-border" style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12, textAlign: 'center', width: 60 }}>{jobsData.grandTotal}</td>
                  <td className="border-t border-border" style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12, textAlign: 'center', width: 80 }}>
                    <span className={jobsData.grandDamage > 0 ? 'text-destructive' : ''}>{jobsData.grandDamage > 0 ? jobsData.grandDamage : '—'}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* RIGHT: Invoice list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 6 }} className="bg-card border border-border">
          <div className="bg-muted border-b border-border" style={{ padding: '8px 12px 6px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6, position: 'relative' }}>
              <span className="text-foreground" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {selectedMatrixUnit ? `Repairs: Unit ${selectedMatrixUnit.split(' - ')[0]}` : 'All Repairs'}
              </span>
              <span className="text-muted-foreground" style={{ fontSize: 11, position: 'absolute', right: 0 }}>{invoices.length} repairs</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Search Unit..."
                value={unitSearchQuery}
                onChange={(e) => setUnitSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="bg-background text-foreground border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 12 }}
              />
              {selectedMatrixUnit && (
                <button
                  onClick={() => setSelectedMatrixUnit(null)}
                  className="bg-accent text-accent-foreground hover:bg-accent/80"
                  style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-muted text-foreground sticky top-0 z-[2]">
                  <th className="border-b border-border border-r border-r-border" style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px' }}>Date</th>
                  <th className="border-b border-border border-r border-r-border" style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px' }}>Unit</th>
                  <th className="border-b border-border" style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px', width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, fontSize: 12 }} className="text-muted-foreground">
                    {units.length === 0 ? 'No repair data available' : 'No invoices found for selected filters'}
                  </td></tr>
                ) : (
                  invoices.map((inv) => {
                    const unitNum = inv.unitNumber.split(' - ')[0];
                    const isDmg = isDamageInvoice(inv);
                    return (
                      <tr
                        key={`${inv.unitNumber}-${inv.invoiceNumber}-${inv.invoiceDate}`}
                        style={{ fontSize: 12, background: isDmg ? 'color-mix(in oklch, var(--destructive) 5%, transparent)' : undefined }}
                        className={isDmg ? 'hover:bg-destructive/10' : 'hover:bg-accent/30'}
                      >
                        <td className="border-b border-border border-r border-r-border" style={{ padding: '3px 8px', whiteSpace: 'nowrap' }}>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                        <td className="border-b border-border border-r border-r-border" style={{ padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {unitNum}
                          {isDmg && <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 leading-tight">Damage</Badge>}
                        </td>
                        <td className="border-b border-border" style={{ padding: '3px 8px', width: 80, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="border border-border hover:bg-accent text-foreground"
                            style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'transparent', cursor: 'pointer' }}
                          >
                            Details
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
