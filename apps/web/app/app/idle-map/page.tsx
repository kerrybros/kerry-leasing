import { Map, Flame, Clock, Fuel } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const mockIdleEvents = [
  { unit: '103', driver: 'Derek Williams',  date: 'Apr 13, 2026', location: 'I-90 & Exit 44, Chicago, IL',      durationMin: 47, fuelGal: 1.8 },
  { unit: '107', driver: 'Steve Hanson',    date: 'Apr 13, 2026', location: 'Truck Stop – Rte 30, Gary, IN',   durationMin: 62, fuelGal: 2.4 },
  { unit: '101', driver: 'Marcus Johnson',  date: 'Apr 12, 2026', location: 'Distribution Ctr, Joliet, IL',    durationMin: 38, fuelGal: 1.5 },
  { unit: '115', driver: 'Chris Reyes',     date: 'Apr 12, 2026', location: 'Weigh Station – I-80, Crete, IL', durationMin: 29, fuelGal: 1.1 },
  { unit: '103', driver: 'Derek Williams',  date: 'Apr 11, 2026', location: 'I-90 & Exit 44, Chicago, IL',      durationMin: 53, fuelGal: 2.0 },
  { unit: '112', driver: 'Aaron Mitchell',  date: 'Apr 11, 2026', location: 'Yard – Kerry Brothers, Alsip, IL', durationMin: 41, fuelGal: 1.6 },
  { unit: '103', driver: 'Derek Williams',  date: 'Apr 10, 2026', location: 'I-90 & Exit 44, Chicago, IL',      durationMin: 58, fuelGal: 2.2 },
];

// Count repeat offenders
const repeatMap = mockIdleEvents.reduce<Record<string, number>>((acc, e) => {
  acc[e.unit] = (acc[e.unit] ?? 0) + 1;
  return acc;
}, {});

export default function IdleMapPage() {
  const totalIdleMin = mockIdleEvents.reduce((s, e) => s + e.durationMin, 0);
  const totalFuel = mockIdleEvents.reduce((s, e) => s + e.fuelGal, 0);
  const repeatOffenders = Object.values(repeatMap).filter(c => c > 1).length;

  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Map className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-1">Idle Map</h1>
          <p className="text-sm text-muted-foreground">Visualize idle events across the fleet. Spot repeat locations and repeat offenders.</p>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Interactive map coming soon — idle events will be plotted by GPS coordinates with heat-map density and unit drill-down.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Idle Events',       value: mockIdleEvents.length,          color: '',                                      icon: Flame },
          { label: 'Total Idle Time',   value: `${totalIdleMin} min`,          color: 'text-amber-600 dark:text-amber-400',    icon: Clock },
          { label: 'Fuel Wasted',       value: `${totalFuel.toFixed(1)} gal`,  color: 'text-destructive',                      icon: Fuel },
          { label: 'Repeat Offenders',  value: repeatOffenders,                color: 'text-destructive',                      icon: Flame },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Map placeholder */}
      <div
        className="relative w-full rounded-xl border border-border overflow-hidden flex items-center justify-center"
        style={{ minHeight: 320, background: 'repeating-linear-gradient(0deg,transparent,transparent 47px,hsl(var(--border)) 47px,hsl(var(--border)) 48px),repeating-linear-gradient(90deg,transparent,transparent 47px,hsl(var(--border)) 47px,hsl(var(--border)) 48px), hsl(var(--muted))' }}
      >
        <div className="text-center space-y-2 px-6 py-12">
          <Map className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Interactive map coming soon</p>
          <p className="text-xs text-muted-foreground/60">GPS coordinates will be plotted per idle event with heat-map clustering</p>
        </div>
      </div>

      {/* Event log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Idle Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Unit #', 'Driver', 'Date', 'Location', 'Duration', 'Fuel Wasted'].map(h => (
                    <th key={h} className="text-left py-2 font-medium text-muted-foreground whitespace-nowrap pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockIdleEvents.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-3 pr-6">
                      <span className="font-medium">{row.unit}</span>
                      {(repeatMap[row.unit] ?? 0) > 1 && (
                        <span className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          ×{repeatMap[row.unit]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-6">{row.driver}</td>
                    <td className="py-3 pr-6 text-muted-foreground whitespace-nowrap">{row.date}</td>
                    <td className="py-3 pr-6 text-muted-foreground max-w-[200px] truncate">{row.location}</td>
                    <td className="py-3 pr-6 text-amber-600 dark:text-amber-400 font-medium">{row.durationMin} min</td>
                    <td className="py-3 text-destructive font-medium">{row.fuelGal} gal</td>
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
