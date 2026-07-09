/**
 * Cron freshness evaluation — pure, dependency-free (no config/prisma), so the
 * staleness logic and alert formatting are unit-tested in isolation.
 *
 * The data-freshness signals themselves are gathered by the caller
 * (run-cron-health-check.ts) from the app DB; this module just decides what's
 * overdue and renders the alert. This is the insurance against a cron dying
 * silently (as the weekly-SMS and EIA crons both did before anyone noticed).
 */

export interface CronHealthCheck {
  /** Human label, e.g. "Weekly driver SMS/email". */
  label: string;
  /** Most recent successful run/refresh, or null if there's no record at all. */
  lastSuccessAt: Date | null;
  /** Overdue once the last success is older than this many hours. */
  maxAgeHours: number;
  /**
   * Whether this job is actually live yet. A job that hasn't been turned on —
   * feature flag off, or no deliverable recipients — is reported as `idle` and
   * NEVER alarms: "nothing sent" is a status, not a failure. Freshness alerting
   * only kicks in once it goes live. Defaults to true (the daily syncs are
   * always live). Only the weekly driver report currently has a pre-live phase.
   */
  live?: boolean;
  /** Optional human note shown alongside the status, e.g. "no report delivered yet". */
  note?: string;
}

export type CronHealthStatus = 'ok' | 'overdue' | 'idle';

export interface CronHealthResult extends CronHealthCheck {
  ageHours: number | null;
  status: CronHealthStatus;
  /** Convenience alias of `status === 'overdue'` — the only state that alarms. */
  overdue: boolean;
}

const MS_PER_HOUR = 3_600_000;

export function evaluateCronHealth(checks: CronHealthCheck[], now: Date): CronHealthResult[] {
  return checks.map((c) => {
    const ageHours =
      c.lastSuccessAt == null ? null : (now.getTime() - c.lastSuccessAt.getTime()) / MS_PER_HOUR;
    // A not-yet-live job is `idle` and never alarms. Otherwise a stale (or
    // never-run) success beyond the window is `overdue`; anything fresher is ok.
    const status: CronHealthStatus =
      c.live === false
        ? 'idle'
        : ageHours == null || ageHours > c.maxAgeHours
          ? 'overdue'
          : 'ok';
    return { ...c, ageHours, status, overdue: status === 'overdue' };
  });
}

function describe(r: CronHealthResult): string {
  if (r.status === 'idle') return `${r.label}: not live yet${r.note ? ` — ${r.note}` : ''}`;
  if (r.ageHours == null) return `${r.label}: NEVER RUN (expected within ${r.maxAgeHours}h)`;
  return `${r.label}: last success ${Math.round(r.ageHours)}h ago (limit ${r.maxAgeHours}h)`;
}

export interface CronAlert {
  subject: string;
  text: string;
  html: string;
}

/**
 * Renders an alert email for the overdue jobs. Returns null when nothing is
 * overdue (caller should send nothing — no news is good news). A job that is
 * merely `idle` (not live yet) never counts toward the alert; it's only listed
 * for context, in gray, when some OTHER job is genuinely overdue.
 */
export function formatCronHealthAlert(results: CronHealthResult[], now: Date): CronAlert | null {
  const overdue = results.filter((r) => r.overdue);
  if (overdue.length === 0) return null;

  const others = results.filter((r) => !r.overdue);
  const subject = `⚠️ Kerry Leasing: ${overdue.length} cron job${overdue.length === 1 ? '' : 's'} overdue`;
  const asOf = now.toISOString();

  const text =
    `${overdue.length} cron job(s) have not succeeded within their expected window ` +
    `(as of ${asOf}):\n\n` +
    overdue.map((r) => `• ${describe(r)}`).join('\n') +
    (others.length ? `\n\nOther jobs:\n` + others.map((r) => `• ${describe(r)}`).join('\n') : '');

  const colorFor = (r: CronHealthResult) =>
    r.status === 'overdue' ? '#b91c1c' : r.status === 'idle' ? '#6b7280' : '#16a34a';
  const row = (r: CronHealthResult) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:${colorFor(r)}">${describe(r)}</td></tr>`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:640px">` +
    `<h2 style="color:#b91c1c">⚠️ ${overdue.length} cron job(s) overdue</h2>` +
    `<p style="color:#666">As of ${asOf}. A job is "overdue" if it hasn't succeeded within its expected window. Jobs that aren't live yet are shown in gray and don't alarm.</p>` +
    `<table style="border-collapse:collapse;width:100%">` +
    overdue.map(row).join('') +
    others.map(row).join('') +
    `</table></div>`;

  return { subject, text, html };
}
