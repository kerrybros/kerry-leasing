'use client';

import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
} from 'recharts';

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
        className="bg-bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center bg-bg-tertiary">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Repair Details</h3>
            <div className="text-sm text-text-secondary mt-1">
              Unit: <span className="font-semibold text-text-primary">{invoice.unitNumber}</span>
              {' '}• Repair Completed Date: {new Date(invoice.invoiceDate).toLocaleDateString()}
              {isDamageInvoice(invoice) && (
                <Badge variant="destructive" className="ml-2">Damage</Badge>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-hover rounded-lg transition-colors text-text-secondary hover:text-text-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <h4 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">Service Lines</h4>
          <div className="space-y-3">
            {invoice.lines
              .filter((line: RepairLineSummary) => line.description && line.description !== '(No description)')
              .map((line: RepairLineSummary, idx: number) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border flex flex-col gap-1 ${
                    isDamageLine(line)
                      ? 'bg-destructive/5 border-destructive/30'
                      : 'bg-bg-secondary border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{line.description}</span>
                    {isDamageLine(line) && (
                      <Badge variant="destructive">Damage</Badge>
                    )}
                  </div>
                  <div className="text-sm text-text-secondary">
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
}: {
  units: RepairUnitSummary[];
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<RepairInvoiceWithUnit | null>(null);
  const [selectedMatrixUnit, setSelectedMatrixUnit] = useState<string | null>(null);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');

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

  // Component/System breakdown data
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; isDamage: boolean }>();
    dateFilteredUnits.forEach(u => {
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
  }, [dateFilteredUnits]);

  // Repair frequency trend (jobs per month)
  const repairTrend = useMemo(() => {
    const monthMap = new Map<string, number>();
    dateFilteredUnits.forEach(u => {
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
  }, [dateFilteredUnits]);

  const handleMatrixClick = (unitNumber: string) => {
    if (selectedMatrixUnit === unitNumber) {
      setSelectedMatrixUnit(null);
    } else {
      setSelectedMatrixUnit(unitNumber);
    }
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
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <div style={{ color: 'var(--error)', fontWeight: 700, marginBottom: 4 }}>Failed to load repair data</div>
          <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      )}

      {/* Main two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px]">
        {/* LEFT: Unit job count list */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col h-full bg-card border border-border rounded shadow-sm overflow-hidden">
          <div className="bg-primary-dark text-white flex flex-col gap-2 px-4 pt-3 pb-3 flex-shrink-0 rounded-t">
            <div className="text-lg font-bold uppercase tracking-wider text-center">Number of Jobs Done</div>
            <div className="grid grid-cols-[1fr_70px_80px] pt-2 border-t border-white/20">
              <div className="text-white font-semibold text-xs uppercase tracking-wider pl-0">Unit</div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider text-center">Jobs</div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider text-center pr-0">Damage</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-card">
            {jobsData.rows.length === 0 ? (
              <div className="text-center p-4 text-text-secondary">No data</div>
            ) : (
              <div className="flex flex-col">
                {jobsData.rows.map((row) => (
                  <div
                    key={row.unitNumber}
                    onClick={() => handleMatrixClick(row.unitNumber)}
                    className="grid grid-cols-[1fr_70px_80px] py-3 border-b border-border hover:bg-bg-hover cursor-pointer transition-colors"
                    style={{
                      background: selectedMatrixUnit === row.unitNumber ? 'var(--bg-hover)' : undefined,
                      borderLeft: selectedMatrixUnit === row.unitNumber ? '4px solid var(--primary)' : '4px solid transparent',
                    }}
                  >
                    <div className="pl-4 font-bold text-text-primary">{row.unitNumber}</div>
                    <div className="font-bold text-text-primary text-center">{row.count}</div>
                    <div className="pr-4 text-center">
                      {row.damageCount > 0 ? (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                          {row.damageCount}
                        </span>
                      ) : (
                        <span className="text-text-secondary text-sm">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-primary-dark text-white font-bold grid grid-cols-[1fr_70px_80px] py-3 border-t border-white/10 flex-shrink-0 z-10">
            <div className="pl-4">Total</div>
            <div className="text-center">{jobsData.grandTotal}</div>
            <div className="pr-4 text-center">{jobsData.grandDamage > 0 ? jobsData.grandDamage : '—'}</div>
          </div>
        </div>

        {/* RIGHT: Invoice list */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col h-full bg-card border border-border rounded shadow-sm overflow-hidden">
          <div className="bg-primary-dark text-white flex flex-col gap-2 px-4 pt-3 pb-3 flex-shrink-0 rounded-t">
            <div className="flex justify-between items-center w-full">
              <span className="text-lg font-bold uppercase tracking-wider">
                {selectedMatrixUnit ? `Repairs: Unit ${selectedMatrixUnit}` : 'All Repairs'}
              </span>
              <span className="text-sm font-normal opacity-80">{invoices.length} repairs</span>
            </div>
            <div className="flex gap-2 w-full">
              <input
                type="text"
                placeholder="Search Unit..."
                value={unitSearchQuery}
                onChange={(e) => setUnitSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-3 py-1.5 rounded text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/60 focus:ring-1 focus:ring-white/50 outline-none"
              />
              {selectedMatrixUnit && (
                <button
                  onClick={() => setSelectedMatrixUnit(null)}
                  className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded transition-colors"
                >
                  Clear Filter
                </button>
              )}
            </div>
            <div className="grid grid-cols-[180px_90px_1fr_120px] pt-2 border-t border-white/20 gap-4">
              <div className="text-white font-semibold text-xs uppercase tracking-wider">Date</div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider">Unit</div>
              <div></div>
              <div className="text-white font-semibold text-xs uppercase tracking-wider text-right">Action</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-card">
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                {units.length === 0 ? 'No repair data available' : 'No invoices found for selected filters'}
              </div>
            ) : (
              <div className="flex flex-col">
                {invoices.map((inv) => (
                  <div
                    key={`${inv.unitNumber}-${inv.invoiceNumber}-${inv.invoiceDate}`}
                    className={`grid grid-cols-[180px_90px_1fr_120px] py-3 px-4 border-b items-center transition-colors gap-4 ${
                      isDamageInvoice(inv)
                        ? 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10'
                        : 'border-border hover:bg-bg-hover'
                    }`}
                  >
                    <div className="text-sm text-text-primary">{new Date(inv.invoiceDate).toLocaleDateString()}</div>
                    <div className="text-sm font-bold text-text-primary flex items-center gap-1">
                      {inv.unitNumber}
                      {isDamageInvoice(inv) && (
                        <Badge variant="destructive">Damage</Badge>
                      )}
                    </div>
                    <div></div>
                    <div className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedInvoice(inv)}>
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBreakdown}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={180}
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--text-secondary)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                    }}
                    formatter={(value: any) => [value, 'Line Items']}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={false}
                    fill="#d9a528"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <rect key={index} fill={entry.isDamage ? '#ef4444' : '#d9a528'} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3 mt-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-primary"></span>
                Standard
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-destructive"></span>
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
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={repairTrend} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                    }}
                    formatter={(value: any) => [value, 'Jobs']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#d9a528"
                    strokeWidth={4}
                    dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }}
                    activeDot={{ r: 7 }}
                  >
                    <LabelList
                      dataKey="count"
                      position="top"
                      offset={10}
                      style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
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
