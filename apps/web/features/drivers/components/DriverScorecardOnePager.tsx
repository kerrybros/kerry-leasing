'use client';

/**
 * Per-driver weekly one-pager.
 *
 * The same React component renders in two places:
 *  - /r/[token]         the page a driver opens from the SMS link
 *  - SmsPreviewView     the inline preview the fleet admin sees
 *
 * Intentionally lean: the metrics the customer cares about — idle %, safety
 * score, and idle fuel — each with the driver's fleet rank (where it applies)
 * and a week-over-week delta. No composite hero, no trend table.
 *
 * Layout is mobile-first; the same DOM scales to PDF export later.
 */

interface OnePagerTrendPoint {
  weekStart: string;
  /** Motive's rolling-4-week safety score as-of this week's end. */
  motiveScore?: number | null;
  idlePct?: number;
  idleFuelGal?: number;
  totalMiles?: number;
}

export interface OnePagerSnapshot {
  displayName?: string;
  firstName?: string;
  /** Overall composite-score rank — still shown in the admin preview list. */
  rank?: number;
  /** Rank by idle % (lower is better), within the reachable population. */
  idleRank?: number | null;
  /** Rank by Motive's rolling safety score (higher is better), among scored drivers. */
  safetyRank?: number | null;
  /** Denominator for safetyRank — drivers that have a Motive score (may differ from totalDrivers). */
  safetyTotal?: number;
  totalDrivers: number;
  fleetAvgMpg?: number;
  noActivity: boolean;
  /** Motive's OWN rolling-4-week safety score as-of the report week end. */
  motiveScore?: number | null;
  current: {
    score?: number;
    idlePct?: number;
    avgMpg?: number;
    idleFuelGal?: number;
    subScores?: { idle: number; mpg: number; safety: number };
  };
  /** 4 trailing weeks, oldest → newest; the last entry is this week. */
  trend?: OnePagerTrendPoint[] | null;
}

interface Props {
  weekStart: string;       // YYYY-MM-DD (Monday)
  snapshot: OnePagerSnapshot;
  sentAt?: string;
  isTest?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtUTCDate(dt: Date): string {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The Mon–Sun week the report covers (idle %, idle fuel, MPG all use this). */
function weekRangeLabel(weekStart: string): string {
  const start = ymdToDate(weekStart);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${fmtUTCDate(start)} – ${fmtUTCDate(end)}`;
}

/**
 * Motive's safety score is a ROLLING 4-week (28-day) window, updated weekly — it
 * is NOT the report week's score. Show the 28 days ending at the report week's
 * end so the number isn't mistaken for a single-week figure.
 */
function safetyWindowLabel(weekStart: string): string {
  const weekEnd = new Date(ymdToDate(weekStart).getTime() + 6 * DAY_MS);
  const windowStart = new Date(weekEnd.getTime() - 27 * DAY_MS);
  return `${fmtUTCDate(windowStart)} – ${fmtUTCDate(weekEnd)}`;
}

type DeltaSpec = { diff: number; unit: string; higherIsBetter: boolean; digits: number };

export function DriverScorecardOnePager({ weekStart, snapshot, sentAt, isTest }: Props) {
  const s = snapshot;
  const range = weekRangeLabel(weekStart);
  const safetyRange = safetyWindowLabel(weekStart);
  const greetingName = s.firstName ?? s.displayName ?? 'there';
  const safety = s.motiveScore;            // Motive's own rolling-4-week score
  const idleFuel = s.current.idleFuelGal;

  // Previous week = the trend entry just before this week. Only compare against
  // a week the driver actually drove, so a dormant week doesn't fake a delta.
  const trend = s.trend ?? [];
  const curIdx = trend.findIndex((t) => t.weekStart === weekStart);
  const prev = curIdx > 0 ? trend[curIdx - 1] : undefined;
  const prevActive = prev != null && (prev.totalMiles ?? 0) > 0;

  const idleDelta: DeltaSpec | null =
    prevActive && prev?.idlePct != null && s.current.idlePct != null
      ? { diff: s.current.idlePct - prev.idlePct, unit: ' pts', higherIsBetter: false, digits: 1 }
      : null;
  const safetyDelta: DeltaSpec | null =
    prevActive && prev?.motiveScore != null && safety != null
      ? { diff: safety - prev.motiveScore, unit: '', higherIsBetter: true, digits: 0 }
      : null;
  const fuelDelta: DeltaSpec | null =
    prevActive && prev?.idleFuelGal != null && idleFuel != null
      ? { diff: idleFuel - prev.idleFuelGal, unit: ' gal', higherIsBetter: false, digits: 1 }
      : null;

  return (
    <div className="bg-white text-slate-900 max-w-md mx-auto p-6 space-y-5 print:p-0">
      {isTest && (
        <div className="text-[11px] text-center text-blue-700 bg-blue-50 rounded px-2 py-1">
          Test message — not from a regular weekly send.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Weekly scorecard · {range}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Hi {greetingName}</h1>
      </header>

      {s.noActivity ? (
        <div className="rounded-lg bg-slate-100 p-6 text-center text-slate-700">
          No driving recorded last week. See you on the road.
        </div>
      ) : (
        <div className="space-y-4">
          <MetricCard
            label="Your safety score"
            sublabel={`Motive rolling 4-week score · ${safetyRange}`}
            value={safety != null ? String(safety) : '—'}
            rank={s.safetyRank}
            total={s.safetyTotal ?? s.totalDrivers}
            delta={safetyDelta}
          />
          <MetricCard
            label="Your idle percentage"
            sublabel={`This week · ${range}`}
            value={`${(s.current.idlePct ?? 0).toFixed(1)}%`}
            rank={s.idleRank}
            total={s.totalDrivers}
            delta={idleDelta}
          />
          <MetricCard
            label="Your idle fuel"
            sublabel={`This week · ${range}`}
            value={idleFuel != null ? `${idleFuel.toFixed(1)} gal` : '—'}
            delta={fuelDelta}
          />
        </div>
      )}

      {sentAt && (
        <footer className="pt-4 border-t border-slate-200 text-[11px] text-center text-slate-400">
          Sent {new Date(sentAt).toLocaleString()}
        </footer>
      )}
    </div>
  );
}

function MetricCard({
  label,
  sublabel,
  value,
  rank,
  total,
  delta,
}: {
  label: string;
  sublabel?: string;
  value: string;
  rank?: number | null;
  total?: number;
  delta?: DeltaSpec | null;
}) {
  const hasRank = rank != null && rank > 0 && (total ?? 0) > 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      {sublabel && <p className="text-[11px] text-slate-400 mt-0.5">{sublabel}</p>}
      <p className="text-5xl font-bold leading-none mt-2">{value}</p>
      {hasRank && (
        <p className="text-sm text-slate-600 mt-3">
          You ranked <span className="font-semibold text-slate-900">#{rank}</span> of {total}{' '}
          drivers in your fleet
        </p>
      )}
      {delta && <DeltaLine {...delta} />}
    </section>
  );
}

function DeltaLine({ diff, unit, higherIsBetter, digits }: DeltaSpec) {
  const neutral = Math.abs(diff) < (digits === 0 ? 0.5 : 0.05);
  const up = diff > 0;
  const good = neutral ? false : higherIsBetter ? up : !up;
  const color = neutral ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-600';
  const arrow = neutral ? '–' : up ? '▲' : '▼';
  return (
    <p className={`text-xs mt-2 ${color}`}>
      {arrow} {neutral ? 'no change' : `${Math.abs(diff).toFixed(digits)}${unit}`} vs last week
    </p>
  );
}
