import { Map } from 'lucide-react';

export default function IdleMapPage() {
  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Map className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-1">Idle Map</h1>
          <p className="text-sm text-muted-foreground">Visualize idle events across the fleet by location.</p>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Coming soon — idle events will be plotted by GPS coordinates with heat-map clustering and repeat-offender tracking.
      </div>

      {/* Map placeholder */}
      <div
        className="relative w-full rounded-xl border border-border overflow-hidden flex items-center justify-center"
        style={{
          minHeight: 480,
          background: 'repeating-linear-gradient(0deg,transparent,transparent 47px,hsl(var(--border)) 47px,hsl(var(--border)) 48px),repeating-linear-gradient(90deg,transparent,transparent 47px,hsl(var(--border)) 47px,hsl(var(--border)) 48px), hsl(var(--muted))',
        }}
      >
        <div className="text-center space-y-3 px-6 py-16">
          <Map className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-base font-medium text-muted-foreground">Interactive map coming soon</p>
          <p className="text-sm text-muted-foreground/50 max-w-xs mx-auto">
            GPS coordinates plotted per idle event with heat-map density and unit drill-down.
          </p>
        </div>
      </div>
    </div>
  );
}
