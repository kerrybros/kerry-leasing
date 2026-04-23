'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { TOOLTIP_STYLE } from '@/features/fleet/utils/chartColors';
import { ArrowRight } from 'lucide-react';

import type { EnrichedIdleEvent, DateRange } from '../types';
import { formatDuration, fuelStr, costStr, dieselPriceSourceSubtext } from '../types';

interface Props {
  events: EnrichedIdleEvent[];
  loading: boolean;
  dieselPrice: number;
  dateRange: DateRange;
  onViewReport: () => void;
}

function buildDailyBars(events: EnrichedIdleEvent[], from: string, to: string) {
  const counts: Record<string, number> = {};
  // Pre-fill all dates in range
  const start = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    counts[d.toISOString().split('T')[0]!] = 0;
  }
  for (const e of events) {
    if (e.date && counts[e.date] !== undefined) {
      counts[e.date] = (counts[e.date] ?? 0) + (e.durationMinutes ?? 0);
    }
  }
  return Object.entries(counts)
    .slice(-7) // show at most 7 bars
    .map(([date, minutes]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      minutes,
    }));
}

export default function SummaryOverlay({ events, loading, dieselPrice, dateRange, onViewReport }: Props) {
  const stats = useMemo(() => {
    const totalEvents = events.length;
    const totalMinutes = events.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
    const totalFuel = events.reduce((s, e) => s + (e.idleFuelGallons ?? 0), 0);
    const estCost = totalFuel * dieselPrice;
    const insideCount = events.filter(e => e.geofenceId != null).length;
    const pctInside = totalEvents > 0 ? Math.round((insideCount / totalEvents) * 100) : 0;

    return { totalEvents, totalMinutes, totalFuel, estCost, pctInside };
  }, [events, dieselPrice]);

  const dailyBars = useMemo(
    () => buildDailyBars(events, dateRange.from, dateRange.to),
    [events, dateRange]
  );

  return (
    <div
      className="absolute top-3 right-3 z-10 w-64 rounded-xl border border-border shadow-lg overflow-hidden"
      style={{ backdropFilter: 'blur(8px)', background: 'hsl(var(--card) / 0.88)' }}
    >
      <div className="p-3 flex flex-col gap-2">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton style={{ height: 14, width: '60%', borderRadius: 4 }} />
            <div className="grid grid-cols-2 gap-1.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} style={{ height: 36, borderRadius: 6 }} />
              ))}
            </div>
            <Skeleton style={{ height: 40, borderRadius: 6 }} />
          </div>
        ) : (
          <>
            {/* 5 inline metrics */}
            <div className="grid grid-cols-2 gap-1.5">
              <MetricChip label="Events" value={stats.totalEvents.toLocaleString('en-US')} />
              <MetricChip label="Idle Time" value={formatDuration(stats.totalMinutes)} />
              <MetricChip label="Fuel" value={fuelStr(stats.totalFuel)} />
              <MetricChip
                label="Est. Cost"
                value={costStr(stats.totalFuel, dieselPrice)}
                caption={dieselPriceSourceSubtext(dieselPrice)}
              />
              <MetricChip label="Inside Geofence" value={`${stats.pctInside}%`} className="col-span-2" />
            </div>

            {/* Mini daily bar chart */}
            {dailyBars.length > 0 && (
              <div className="h-10 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyBars} margin={{ top: 0, bottom: 0, left: 0, right: 0 }} barCategoryGap="15%">
                    <XAxis dataKey="date" hide />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: unknown) => [`${Number(v).toLocaleString('en-US')}m`, 'Idle']}
                      labelStyle={{ fontSize: 10 }}
                    />
                    <Bar dataKey="minutes" fill="#d9a528" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* View Report CTA */}
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs w-full gap-1"
              onClick={onViewReport}
            >
              View Report <ArrowRight className="w-3 h-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function MetricChip({ label, value, className, caption }: { label: string; value: string; className?: string; caption?: string }) {
  return (
    <div className={`bg-muted/60 rounded-md px-2 py-1.5 ${className ?? ''}`}>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-foreground leading-none">{value}</p>
      {caption && (
        <p className="text-[8px] text-muted-foreground/85 leading-tight mt-1">{caption}</p>
      )}
    </div>
  );
}
