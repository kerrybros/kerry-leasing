'use client';

import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/Skeleton';

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

const chartBarStyle = {
  background: 'var(--primary-dark)',
  fontSize: '1.25rem',
  fontWeight: '700',
  color: '#fff',
  padding: '0.5rem 1rem',
  borderRadius: '4px 4px 0 0',
  marginBottom: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

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
              Unit: <span className="font-semibold text-text-primary">{invoice.unitNumber}</span> • Repair Completed Date: {new Date(invoice.invoiceDate).toLocaleDateString()}
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
                  className="p-4 bg-bg-secondary rounded-lg border border-border flex flex-col gap-1"
                >
                  <div className="font-semibold text-text-primary">{line.description}</div>
                  <div className="text-sm text-text-secondary">
                    {line.component || 'N/A'} / {line.system || 'N/A'}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="p-4 border-t border-border bg-bg-tertiary flex justify-end">
          <button onClick={onClose} className="btn btn-primary">Close</button>
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
    const data: { unitNumber: string; count: number }[] = [];
    let grandTotal = 0;
    dateFilteredUnits.forEach(u => {
      const orders = new Set<string>();
      u.invoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        orders.add(jobId);
      });
      const count = orders.size;
      grandTotal += count;
      if (count > 0) {
        data.push({ unitNumber: u.unitNumber, count });
      }
    });
    data.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
    return { rows: data, grandTotal };
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card">
          <Skeleton style={{ height: 44, borderRadius: 8 }} />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <Skeleton style={{ height: 22, width: '40%', borderRadius: 8, marginBottom: 12 }} />
            <Skeleton style={{ height: 14, width: '25%', borderRadius: 8, marginBottom: 18 }} />
            <Skeleton style={{ height: 220, borderRadius: 8 }} />
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px]">
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col h-full bg-bg-card border border-border rounded shadow-sm overflow-hidden">
          <div style={{ ...chartBarStyle, flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', paddingBottom: '1rem', flexShrink: 0 }}>
            <div className="flex justify-center items-center w-full">Number of Jobs Done</div>
            <div className="flex gap-2 w-full opacity-0 pointer-events-none" aria-hidden="true">
              <div className="flex-1 px-3 py-1.5 rounded text-sm border border-transparent">&nbsp;</div>
            </div>
            <div className="grid grid-cols-[1fr_80px] w-full mt-2 pt-2 border-t border-white/20">
              <div className="text-white font-semibold text-sm uppercase tracking-wider pl-4">Unit</div>
              <div className="text-white font-semibold text-sm uppercase tracking-wider text-center pr-4">Count</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-bg-card">
            {jobsData.rows.length === 0 ? (
              <div className="text-center p-4 text-text-secondary">No data</div>
            ) : (
              <div className="flex flex-col">
                {jobsData.rows.map((row) => (
                  <div
                    key={row.unitNumber}
                    onClick={() => handleMatrixClick(row.unitNumber)}
                    className="grid grid-cols-[1fr_80px] py-3 border-b border-border hover:bg-bg-hover cursor-pointer transition-colors"
                    style={{
                      background: selectedMatrixUnit === row.unitNumber ? 'var(--bg-hover)' : undefined,
                      borderLeft: selectedMatrixUnit === row.unitNumber ? '4px solid var(--primary)' : '4px solid transparent',
                    }}
                  >
                    <div className="pl-4 font-bold text-text-primary">{row.unitNumber}</div>
                    <div className="pr-4 font-bold text-text-primary text-center">{row.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-primary-dark text-white font-bold grid grid-cols-[1fr_80px] py-3 border-t border-white/10 flex-shrink-0 z-10">
            <div className="pl-4">Total</div>
            <div className="pr-4 text-center">{jobsData.grandTotal}</div>
          </div>
        </div>

        <div className="lg:col-span-8 xl:col-span-9 flex flex-col h-full bg-bg-card border border-border rounded shadow-sm overflow-hidden">
          <div style={{ ...chartBarStyle, flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', paddingBottom: '1rem', flexShrink: 0 }}>
            <div className="flex justify-between items-center w-full">
              <span>{selectedMatrixUnit ? `Repairs: Unit ${selectedMatrixUnit}` : 'All Repairs'}</span>
              <div className="text-sm font-normal opacity-80">{invoices.length} repairs</div>
            </div>
            <div className="flex gap-2 w-full">
              <input
                type="text"
                placeholder="Search Unit..."
                value={unitSearchQuery}
                onChange={(e) => setUnitSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-3 py-1.5 rounded text-sm text-text-primary bg-bg-card border-none focus:ring-2 focus:ring-primary outline-none"
                style={{ color: 'var(--text-primary)' }}
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
            <div className="grid grid-cols-[200px_100px_1fr_160px] w-full mt-2 pt-2 border-t border-white/20 px-4 gap-4">
              <div className="text-white font-semibold text-sm uppercase tracking-wider">Repair Completed Date</div>
              <div className="text-white font-semibold text-sm uppercase tracking-wider">Unit</div>
              <div className="text-white font-semibold text-sm uppercase tracking-wider"></div>
              <div className="text-white font-semibold text-sm uppercase tracking-wider text-right">Action</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-bg-card">
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                {units.length === 0 ? 'No repair data available' : 'No invoices found for selected filters'}
              </div>
            ) : (
              <div className="flex flex-col">
                {invoices.map((inv) => (
                  <div
                    key={`${inv.unitNumber}-${inv.invoiceNumber}-${inv.invoiceDate}`}
                    className="grid grid-cols-[200px_100px_1fr_160px] py-3 px-4 border-b border-border items-center hover:bg-bg-hover transition-colors gap-4"
                  >
                    <div className="text-sm text-text-primary">{new Date(inv.invoiceDate).toLocaleDateString()}</div>
                    <div className="text-sm font-bold text-text-primary">{inv.unitNumber}</div>
                    <div></div>
                    <div className="text-right">
                      <button
                        className="btn btn-primary text-xs py-1 px-3"
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        View Repair Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <RepairDetailsModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
