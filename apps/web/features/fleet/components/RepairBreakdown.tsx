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
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
          <div className="font-bold mb-1">Failed to load repair data</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Main two-panel layout */}
      <div style={{ display: 'flex', gap: 16, height: 480 }}>
        {/* LEFT: Unit job count list */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 6, border: '1px solid #333' }} className="bg-card">
          <div className="bg-primary-dark text-white" style={{ padding: '8px 0 6px', flexShrink: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Number of Jobs Done
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#1a1500', color: 'white' }}>
                  <th style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.15)', background: 'inherit' }}>Unit</th>
                  <th style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px', width: 55, borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.15)', background: 'inherit' }}>Jobs</th>
                  <th style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '5px 8px', width: 55, borderBottom: '1px solid rgba(255,255,255,0.2)', background: 'inherit' }}>Dmg</th>
                </tr>
              </thead>
              <tbody>
                {jobsData.rows.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, fontSize: 12 }} className="text-muted-foreground">No data</td></tr>
                ) : (
                  jobsData.rows.map((row) => (
                    <tr
                      key={row.unitNumber}
                      onClick={() => handleMatrixClick(row.unitNumber)}
                      style={{
                        cursor: 'pointer',
                        fontSize: 12,
                        background: selectedMatrixUnit === row.unitNumber ? 'hsl(var(--accent))' : undefined,
                        borderLeft: selectedMatrixUnit === row.unitNumber ? '3px solid hsl(var(--primary))' : '3px solid transparent',
                      }}
                      className="hover:bg-accent/30"
                    >
                      <td style={{ padding: '3px 8px', fontWeight: 700, borderBottom: '1px solid #333', borderRight: '1px solid #2a2a2a' }}>{row.unitNumber.split(' - ')[0]}</td>
                      <td style={{ padding: '3px 8px', fontWeight: 700, textAlign: 'center', width: 55, borderBottom: '1px solid #333', borderRight: '1px solid #2a2a2a' }}>{row.count}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'center', width: 55, borderBottom: '1px solid #333' }}>
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
                <tr style={{ position: 'sticky', bottom: 0, zIndex: 2, background: '#1a1500', color: 'white' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.15)', background: 'inherit' }}>Total</td>
                  <td style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12, textAlign: 'center', width: 55, borderTop: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.15)', background: 'inherit' }}>{jobsData.grandTotal}</td>
                  <td style={{ padding: '5px 8px', fontWeight: 700, fontSize: 12, textAlign: 'center', width: 55, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'inherit' }}>{jobsData.grandDamage > 0 ? jobsData.grandDamage : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* RIGHT: Invoice list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 6, border: '1px solid #333' }} className="bg-card">
          <div className="bg-primary-dark text-white" style={{ padding: '10px 12px 8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {selectedMatrixUnit ? `Repairs: Unit ${selectedMatrixUnit.split(' - ')[0]}` : 'All Repairs'}
              </span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{invoices.length} repairs</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Search Unit..."
                value={unitSearchQuery}
                onChange={(e) => setUnitSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1, padding: '5px 10px', borderRadius: 4, fontSize: 13, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', outline: 'none' }}
              />
              {selectedMatrixUnit && (
                <button
                  onClick={() => setSelectedMatrixUnit(null)}
                  style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', color: 'white', padding: '5px 10px', borderRadius: 4, border: 'none', cursor: 'pointer' }}
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-primary-dark text-white" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '6px 10px', width: '20%', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>Date</th>
                  <th style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '6px 10px', width: '15%', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>Unit</th>
                  <th style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.15)' }}>Description</th>
                  <th style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', padding: '6px 10px', width: 90, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, fontSize: 13 }} className="text-muted-foreground">
                    {units.length === 0 ? 'No repair data available' : 'No invoices found for selected filters'}
                  </td></tr>
                ) : (
                  invoices.map((inv) => {
                    const parts = inv.unitNumber.split(' - ');
                    const unitNum = parts[0];
                    const unitDesc = parts.slice(1).join(' - ') || '';
                    const isDmg = isDamageInvoice(inv);
                    return (
                      <tr
                        key={`${inv.unitNumber}-${inv.invoiceNumber}-${inv.invoiceDate}`}
                        style={{ fontSize: 12, background: isDmg ? 'rgba(220,38,38,0.05)' : undefined }}
                        className={isDmg ? 'hover:bg-destructive/10' : 'hover:bg-accent/30'}
                      >
                        <td style={{ padding: '5px 10px', width: '20%', borderBottom: '1px solid #333', borderRight: '1px solid #2a2a2a' }}>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                        <td style={{ padding: '5px 10px', width: '15%', fontWeight: 700, borderBottom: '1px solid #333', borderRight: '1px solid #2a2a2a' }}>
                          {unitNum}
                          {isDmg && <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 leading-tight">DMG</Badge>}
                        </td>
                        <td style={{ padding: '5px 10px', borderBottom: '1px solid #333', borderRight: '1px solid #2a2a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }} className="text-muted-foreground">{unitDesc}</td>
                        <td style={{ padding: '5px 10px', width: 90, textAlign: 'center', borderBottom: '1px solid #333' }}>
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #444', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                            className="hover:bg-accent"
                          >
                            View Details
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
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBreakdown}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#888' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={180}
                    stroke="#888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#aaa' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: 4,
                      color: '#ccc',
                    }}
                    formatter={(value) => [value as string, 'Line Items']}
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
                      style={{ fill: '#aaa', fontSize: 11 }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#aaa' }}
                  />
                  <YAxis
                    stroke="#888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    tick={{ fill: '#aaa' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1a1a1a',
                      border: '1px solid #444',
                      borderRadius: 4,
                      color: '#ccc',
                    }}
                    formatter={(value) => [value as string, 'Jobs']}
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
                      style={{ fill: '#aaa', fontSize: 11, fontWeight: 600 }}
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
