'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UnitTypeFilter } from '@/components/UnitTypeFilter';
import type { UnitType } from '@/hooks/useDataQueries';

type PmStatus = 'Overdue' | 'Due Soon' | 'OK';

interface PmRow {
  unitNumber: string;
  vin: string;
  unitType: UnitType;
  lastLofDate: string;
  lastLofMileage: number;
  currentMileage: number;
  nextDueDate: string;
  nextDueMileage: number;
  status: PmStatus;
}

const mockPmData: PmRow[] = [
  { unitNumber: '101', vin: '1FVACWDT5DHBP0001', unitType: 'TRACTOR',   lastLofDate: 'Jan 15, 2026', lastLofMileage: 142000, currentMileage: 153800, nextDueDate: 'Apr 15, 2026', nextDueMileage: 157000, status: 'Due Soon' },
  { unitNumber: '102', vin: '1FVACWDT5DHBP0002', unitType: 'TRACTOR',   lastLofDate: 'Feb 2, 2026',  lastLofMileage: 98500,  currentMileage: 105200, nextDueDate: 'May 2, 2026',  nextDueMileage: 113500, status: 'OK' },
  { unitNumber: '103', vin: '3AKJHHDR7MSMS0003', unitType: 'TRACTOR',   lastLofDate: 'Dec 10, 2025', lastLofMileage: 210000, currentMileage: 228400, nextDueDate: 'Mar 10, 2026', nextDueMileage: 225000, status: 'Overdue' },
  { unitNumber: '104', vin: '3AKJHHDR7MSMS0004', unitType: 'TRACTOR',   lastLofDate: 'Mar 1, 2026',  lastLofMileage: 177000, currentMileage: 180100, nextDueDate: 'Jun 1, 2026',  nextDueMileage: 192000, status: 'OK' },
  { unitNumber: '105', vin: '1XPBD49X4JD0005',   unitType: 'BOX_TRUCK', lastLofDate: 'Feb 20, 2026', lastLofMileage: 85000,  currentMileage: 89600,  nextDueDate: 'Apr 12, 2026', nextDueMileage: 90000,  status: 'Due Soon' },
  { unitNumber: '107', vin: '1XPBD49X4JD0007',   unitType: 'BOX_TRUCK', lastLofDate: 'Jan 5, 2026',  lastLofMileage: 133000, currentMileage: 148700, nextDueDate: 'Apr 5, 2026',  nextDueMileage: 148000, status: 'Overdue' },
  { unitNumber: '110', vin: '1FVACWDT5DHBP0010', unitType: 'TRAILER',   lastLofDate: 'Mar 18, 2026', lastLofMileage: 62000,  currentMileage: 64200,  nextDueDate: 'Jun 18, 2026', nextDueMileage: 77000,  status: 'OK' },
  { unitNumber: '112', vin: '1FVACWDT5DHBP0012', unitType: 'TRAILER',   lastLofDate: 'Mar 5, 2026',  lastLofMileage: 195000, currentMileage: 197800, nextDueDate: 'Jun 5, 2026',  nextDueMileage: 210000, status: 'OK' },
  { unitNumber: '115', vin: '3AKJHHDR7MSMS0015', unitType: 'SWITCHER',  lastLofDate: 'Nov 20, 2025', lastLofMileage: 240000, currentMileage: 260300, nextDueDate: 'Feb 20, 2026', nextDueMileage: 255000, status: 'Overdue' },
];

function StatusBadge({ status }: { status: PmStatus }) {
  if (status === 'Overdue') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        Overdue
      </span>
    );
  }
  if (status === 'Due Soon') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Due Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
      OK
    </span>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  );
}

function getWeekLabel(offset: number): string {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}, ${startOfWeek.getFullYear()}`;
}

function getMonthLabel(offset: number): string {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

type ViewMode = 'weekly' | 'monthly';

const tableHeaders = ['Unit #', 'VIN', 'Last LOF Date', 'Last LOF Mi', 'Current Mi', 'Next Due Date', 'Next Due Mi', 'Status'];

export default function PmPage() {
  const [view, setView] = useState<ViewMode>('weekly');
  const [offset, setOffset] = useState(0);
  const [selectedUnitTypes, setSelectedUnitTypes] = useState<UnitType[]>([]);

  const filteredPmData = useMemo(
    () => selectedUnitTypes.length > 0 ? mockPmData.filter(r => selectedUnitTypes.includes(r.unitType)) : mockPmData,
    [selectedUnitTypes]
  );

  const overdue = filteredPmData.filter((r) => r.status === 'Overdue').length;
  const dueSoon = filteredPmData.filter((r) => r.status === 'Due Soon').length;
  const ok = filteredPmData.filter((r) => r.status === 'OK').length;

  const periodLabel = view === 'weekly' ? getWeekLabel(offset) : getMonthLabel(offset);

  return (
    <div className="mx-auto px-4 py-8 max-w-6xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Preventative Maintenance</h1>
          <p className="text-sm text-muted-foreground">LOF schedules by date and mileage.</p>
        </div>

        {/* Unit type filter */}
        <UnitTypeFilter value={selectedUnitTypes} onChange={setSelectedUnitTypes} availableTypes={[...new Set(mockPmData.map(r => r.unitType))] as UnitType[]} />

        {/* View toggle */}
        <div className="flex gap-1 rounded-lg border border-border p-1 bg-muted">
          <button
            onClick={() => { setView('weekly'); setOffset(0); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'weekly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => { setView('monthly'); setOffset(0); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Live data coming soon — LOF schedules will sync automatically from the shop management system.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Units" value={filteredPmData.length} />
        <KpiCard label="Overdue" value={overdue} color="text-destructive" />
        <KpiCard label="Due This Period" value={dueSoon} color="text-amber-600 dark:text-amber-400" />
        <KpiCard label="OK" value={ok} color="text-green-600 dark:text-green-400" />
      </div>

      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">
              {view === 'weekly' ? 'This Week' : 'This Month'}: {periodLabel}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset((o) => o - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOffset(0)} className="h-8 text-xs">
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOffset((o) => o + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {tableHeaders.map((h) => (
                    <th key={h} className="text-left py-2 font-medium text-muted-foreground whitespace-nowrap pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPmData.map((row) => (
                  <tr key={row.unitNumber} className="border-b border-border last:border-0">
                    <td className="py-3 font-medium pr-4">{row.unitNumber}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground pr-4">{row.vin}</td>
                    <td className="py-3 text-muted-foreground pr-4 whitespace-nowrap">{row.lastLofDate}</td>
                    <td className="py-3 text-muted-foreground pr-4">{row.lastLofMileage.toLocaleString()}</td>
                    <td className="py-3 pr-4">{row.currentMileage.toLocaleString()}</td>
                    <td className="py-3 text-muted-foreground pr-4 whitespace-nowrap">{row.nextDueDate}</td>
                    <td className="py-3 text-muted-foreground pr-4">{row.nextDueMileage.toLocaleString()}</td>
                    <td className="py-3"><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
