'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const mockUnits = [
  { unitNumber: '101', vin: '1FVACWDT5DHBP0001', yearMakeModel: '2022 Freightliner Cascadia', monthlyRate: 2850, notes: '' },
  { unitNumber: '102', vin: '1FVACWDT5DHBP0002', yearMakeModel: '2022 Freightliner Cascadia', monthlyRate: 2850, notes: '' },
  { unitNumber: '103', vin: '3AKJHHDR7MSMS0003', yearMakeModel: '2021 Kenworth T680',         monthlyRate: 3100, notes: 'Sleeper' },
  { unitNumber: '104', vin: '3AKJHHDR7MSMS0004', yearMakeModel: '2021 Kenworth T680',         monthlyRate: 3100, notes: 'Sleeper' },
  { unitNumber: '105', vin: '1XPBD49X4JD0005',  yearMakeModel: '2018 Peterbilt 579',         monthlyRate: 2600, notes: '' },
];

const totalMonthly = mockUnits.reduce((sum, u) => sum + u.monthlyRate, 0);

export default function AdminExhibitBPage() {
  return (
    <div className="mx-auto px-4 py-8 max-w-4xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Exhibit B — Fleet Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Source of truth for each unit&apos;s monthly lease rate.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        This page will be the source of truth for each customer&apos;s fleet pricing. Data entry and import coming soon.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fleet Pricing Table</CardTitle>
          <CardDescription>Monthly lease rates per unit as defined in the contract Exhibit B.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Unit #</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">VIN</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Year / Make / Model</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Monthly Rate</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody>
                {mockUnits.map((unit) => (
                  <tr key={unit.unitNumber} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium">{unit.unitNumber}</td>
                    <td className="py-2.5 font-mono text-xs text-muted-foreground">{unit.vin}</td>
                    <td className="py-2.5">{unit.yearMakeModel}</td>
                    <td className="py-2.5 text-right font-medium">${unit.monthlyRate.toLocaleString()}</td>
                    <td className="py-2.5 text-muted-foreground">{unit.notes || '—'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/40">
                  <td colSpan={3} className="py-3 font-semibold text-right pr-4">Total Monthly</td>
                  <td className="py-3 text-right font-bold text-base">${totalMonthly.toLocaleString()}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
