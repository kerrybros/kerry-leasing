'use client';

/**
 * Per-driver weekly one-pager.
 *
 * The same React component renders in two places:
 *  - /r/[token]         the page a driver opens from the SMS link
 *  - SmsPreviewView     the inline preview the fleet admin sees
 *
 * Pure data: rank + this-week metrics + fuel + rolling 4-week table +
 * vs-4-week-average lines. No charts, no tier, no coaching tips.
 *
 * Layout is mobile-first; the same DOM scales to PDF export later
 * (CSS uses regular units, no viewport-fixed positioning).
 */

interface TrendPoint {
  weekStart: string;
  score: number;
  idlePct: number;
  avgMpg: number;
  totalMiles: number;
  hardEvents: number;
  idleFuelGal: number;
}

export interface OnePagerSnapshot {
  displayName?: string;
  firstName?: string;
  rank: number;
  totalDrivers: number;
  fleetAvgMpg: number;
  noActivity: boolean;
  current: {
    score: number;
    idlePct: number;
    avgMpg: number;
    totalMiles: number;
    hardEvents: number;
    idleFuelGal: number;
    drivingFuelGal: number;
    totalFuelGal: number;
    driveTimeHrs: number;
  };
  trend?: TrendPoint[] | null;
  trailing4WeekAvg?: {
    idlePct: number;
    avgMpg: number;
    hardEvents: number;
    totalMiles: number;
    score: number;
  } | null;
  diffVsAvg?: {
    idlePctPts: number;
    avgMpg: number;
    hardEvents: number;
    score: number;
  } | null;
}

interface Props {
  weekStart: string;       // YYYY-MM-DD (Monday)
  snapshot: OnePagerSnapshot;
  sentAt?: string;
  isTest?: boolean;
}

function ymdToShortLabel(weekStart: string): { range: string; thisWeekLabel: string } {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    range: `${fmt(start)} – ${fmt(end)}`,
    thisWeekLabel: fmt(start),
  };
}

function ymdToWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ArrowUpDown({ up, neutral }: { up: boolean; neutral?: boolean }) {
  if (neutral) return <span className="text-slate-400">—</span>;
  return up ? <span className="text-emerald-600">▲</span> : <span className="text-rose-600">▼</span>;
}

export function DriverScorecardOnePager({ weekStart, snapshot, sentAt, isTest }: Props) {
  const s = snapshot;
  const week = ymdToShortLabel(weekStart);
  const trend = s.trend ?? [];
  const diff = s.diffVsAvg;
  const greetingName = s.firstName ?? s.displayName ?? 'there';

  return (
    <div className="bg-white text-slate-900 max-w-2xl mx-auto p-6 space-y-6 print:p-0">
      {isTest && (
        <div className="text-[11px] text-center text-blue-700 bg-blue-50 rounded px-2 py-1">
          Test message — not from a regular weekly send.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Weekly scorecard · {week.range}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Hi {greetingName}</h1>
      </header>

      {s.noActivity ? (
        <div className="rounded-lg bg-slate-100 p-6 text-center text-slate-700">
          No driving recorded last week. See you on the road.
        </div>
      ) : (
        <>
          {/* Rank hero */}
          <section className="rounded-2xl bg-slate-900 text-white p-6 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-300">Your rank</p>
            <p className="text-6xl font-bold leading-none mt-1">{s.rank}</p>
            <p className="text-sm text-slate-300 mt-2">of {s.totalDrivers} drivers in your fleet</p>
            <div className="h-px bg-slate-700 my-4" />
            <p className="text-[11px] uppercase tracking-wider text-slate-300">Safety Score</p>
            <p className="text-3xl font-semibold mt-1">{s.current.score}</p>
          </section>

          {/* This week */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">This week</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Miles" value={Math.round(s.current.totalMiles).toLocaleString()} />
              <Metric label="MPG" value={s.current.avgMpg.toFixed(1)} />
              <Metric label="Idle" value={`${s.current.idlePct.toFixed(1)}%`} />
              <Metric label="Hard events" value={String(s.current.hardEvents)} />
            </div>
          </section>

          {/* Fuel */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Fuel</h2>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
              <FuelRow label="Driving fuel" value={`${Math.round(s.current.drivingFuelGal)} gal`} />
              <FuelRow label="Idle fuel" value={`${Math.round(s.current.idleFuelGal)} gal`} />
              <FuelRow label="Total fuel" value={`${Math.round(s.current.totalFuelGal)} gal`} />
              {s.fleetAvgMpg > 0 && (
                <FuelRow
                  label="Fleet avg MPG"
                  value={s.fleetAvgMpg.toFixed(1)}
                  trailing={
                    <span className="text-slate-500 text-xs">(you: {s.current.avgMpg.toFixed(1)})</span>
                  }
                />
              )}
            </div>
          </section>

          {/* Rolling 4 weeks */}
          {trend.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Rolling 4 weeks</h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Week</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Score</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Idle</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">MPG</th>
                      <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Miles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trend.map((row, i) => {
                      const isCurrent = row.weekStart === weekStart;
                      return (
                        <tr key={i} className={isCurrent ? 'bg-slate-50 font-medium' : ''}>
                          <td className="px-3 py-2">
                            {ymdToWeekLabel(row.weekStart)}
                            {isCurrent && <span className="ml-1 text-emerald-600">★</span>}
                          </td>
                          <td className="px-3 py-2 text-right">{row.score}</td>
                          <td className="px-3 py-2 text-right">{row.idlePct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right">{row.avgMpg.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right">{Math.round(row.totalMiles).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">★ this week</p>
            </section>
          )}

          {/* vs 4-week avg */}
          {diff && (
            <section>
              <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">vs your 4-week average</h2>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DiffStat label="Score" diff={diff.score} format={(v) => v.toFixed(0)} higherIsBetter />
                <DiffStat label="Idle" diff={diff.idlePctPts} format={(v) => `${v.toFixed(1)} pt`} higherIsBetter={false} />
                <DiffStat label="MPG" diff={diff.avgMpg} format={(v) => v.toFixed(1)} higherIsBetter />
                <DiffStat label="Hard events" diff={diff.hardEvents} format={(v) => v.toFixed(0)} higherIsBetter={false} />
              </dl>
            </section>
          )}
        </>
      )}

      {sentAt && (
        <footer className="pt-4 border-t border-slate-200 text-[11px] text-center text-slate-400">
          Sent {new Date(sentAt).toLocaleString()}
        </footer>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function FuelRow({ label, value, trailing }: { label: string; value: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-2.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{value}</span>
        {trailing}
      </span>
    </div>
  );
}

function DiffStat({
  label,
  diff,
  format,
  higherIsBetter,
}: {
  label: string;
  diff: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}) {
  const neutral = Math.abs(diff) < 0.05;
  const isUp = diff > 0;
  const isGood = neutral ? false : higherIsBetter ? isUp : !isUp;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-base font-semibold mt-0.5 flex items-center gap-1 ${neutral ? 'text-slate-500' : isGood ? 'text-emerald-700' : 'text-rose-600'}`}>
        <ArrowUpDown up={isUp} neutral={neutral} />
        {neutral ? 'flat' : `${diff > 0 ? '+' : ''}${format(diff)}`}
      </p>
    </div>
  );
}
