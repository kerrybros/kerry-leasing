'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type WipStatus = 'In Progress' | 'Waiting for Parts' | 'Waiting for Approval';

interface WipRow {
  unitNumber: string;
  vin: string;
  workOrderNumber: string;
  status: WipStatus;
  dateIn: string;
  estimatedCompletion: string;
}

const mockWipData: WipRow[] = [
  { unitNumber: '101', vin: '1FVACWDT5DHBP0001', workOrderNumber: 'WO-2024-0041', status: 'In Progress',          dateIn: 'Apr 7, 2026', estimatedCompletion: 'Apr 11, 2026' },
  { unitNumber: '103', vin: '3AKJHHDR7MSMS0003', workOrderNumber: 'WO-2024-0042', status: 'Waiting for Parts',    dateIn: 'Apr 8, 2026', estimatedCompletion: 'Apr 14, 2026' },
  { unitNumber: '107', vin: '1XPBD49X4JD0007',  workOrderNumber: 'WO-2024-0043', status: 'Waiting for Approval', dateIn: 'Apr 9, 2026', estimatedCompletion: 'Apr 10, 2026' },
  { unitNumber: '112', vin: '1FVACWDT5DHBP0012', workOrderNumber: 'WO-2024-0044', status: 'In Progress',          dateIn: 'Apr 9, 2026', estimatedCompletion: 'Apr 12, 2026' },
];

function StatusBadge({ status }: { status: WipStatus }) {
  if (status === 'In Progress') {
    return <Badge variant="default">{status}</Badge>;
  }
  if (status === 'Waiting for Parts') {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {status}
      </span>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default function WipPage() {
  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Work In Progress</h1>
        <p className="text-sm text-muted-foreground">Units currently at the shop.</p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Live data coming soon — this page will connect to the shop management system.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Unit #</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">VIN</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Work Order #</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Date In</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Est. Completion</th>
                </tr>
              </thead>
              <tbody>
                {mockWipData.map((row) => (
                  <tr key={row.workOrderNumber} className="border-b border-border last:border-0">
                    <td className="py-3 font-medium">{row.unitNumber}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">{row.vin}</td>
                    <td className="py-3 text-muted-foreground">{row.workOrderNumber}</td>
                    <td className="py-3"><StatusBadge status={row.status} /></td>
                    <td className="py-3 text-muted-foreground">{row.dateIn}</td>
                    <td className="py-3 text-muted-foreground">{row.estimatedCompletion}</td>
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
