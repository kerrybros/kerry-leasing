import { ClipboardCheck, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const mockInspections = [
  { unit: '101', driver: 'Marcus Johnson',  type: 'Pre-Trip',  time: '6:02 AM',  date: 'Apr 13, 2026', status: 'Pass' },
  { unit: '103', driver: 'Derek Williams',  type: 'Pre-Trip',  time: '6:18 AM',  date: 'Apr 13, 2026', status: 'Fail' },
  { unit: '107', driver: 'Steve Hanson',    type: 'Post-Trip', time: '5:44 PM',  date: 'Apr 12, 2026', status: 'Pass' },
  { unit: '112', driver: 'Aaron Mitchell',  type: 'Pre-Trip',  time: '7:01 AM',  date: 'Apr 13, 2026', status: 'Pass' },
  { unit: '115', driver: 'Chris Reyes',     type: 'Pre-Trip',  time: '5:58 AM',  date: 'Apr 13, 2026', status: 'Pending' },
  { unit: '104', driver: 'James Carter',    type: 'Post-Trip', time: '6:12 PM',  date: 'Apr 12, 2026', status: 'Pass' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'Pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" /> Pass
      </span>
    );
  }
  if (status === 'Fail') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        <AlertCircle className="h-3 w-3" /> Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

export default function WhiparoundPage() {
  const pass = mockInspections.filter(r => r.status === 'Pass').length;
  const fail = mockInspections.filter(r => r.status === 'Fail').length;
  const pending = mockInspections.filter(r => r.status === 'Pending').length;

  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-1">Whiparound</h1>
          <p className="text-sm text-muted-foreground">Pre &amp; post-trip DVIR inspections across your fleet.</p>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Live data coming soon — inspection results will sync automatically from the Whiparound integration.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Today',  value: mockInspections.length, color: '' },
          { label: 'Passed',       value: pass,    color: 'text-green-600 dark:text-green-400' },
          { label: 'Failed',       value: fail,    color: 'text-destructive' },
          { label: 'Pending',      value: pending, color: 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Inspection log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Unit #', 'Driver', 'Type', 'Date', 'Time', 'Status'].map(h => (
                    <th key={h} className="text-left py-2 font-medium text-muted-foreground whitespace-nowrap pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockInspections.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-3 font-medium pr-6">{row.unit}</td>
                    <td className="py-3 pr-6">{row.driver}</td>
                    <td className="py-3 pr-6 text-muted-foreground">{row.type}</td>
                    <td className="py-3 pr-6 text-muted-foreground whitespace-nowrap">{row.date}</td>
                    <td className="py-3 pr-6 text-muted-foreground">{row.time}</td>
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
