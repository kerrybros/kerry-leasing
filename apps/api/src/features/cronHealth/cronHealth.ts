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
}

export interface CronHealthResult extends CronHealthCheck {
  ageHours: number | null;
  overdue: boolean;
}

const MS_PER_HOUR = 3_600_000;

export function evaluateCronHealth(checks: CronHealthCheck[], now: Date): CronHealthResult[] {
  return checks.map((c) => {
    const ageHours =
      c.lastSuccessAt == null ? null : (now.getTime() - c.lastSuccessAt.getTime()) / MS_PER_HOUR;
    // Never-run (null) counts as overdue — that's exactly the "cron never fired" case.
    const overdue = ageHours == null || ageHours > c.maxAgeHours;
    return { ...c, ageHours, overdue };
  });
}

function describe(r: CronHealthResult): string {
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
 * overdue (caller should send nothing — no news is good news).
 */
export function formatCronHealthAlert(results: CronHealthResult[], now: Date): CronAlert | null {
  const overdue = results.filter((r) => r.overdue);
  if (overdue.length === 0) return null;

  const subject = `⚠️ Kerry Leasing: ${overdue.length} cron job${overdue.length === 1 ? '' : 's'} overdue`;
  const asOf = now.toISOString();

  const text =
    `${overdue.length} cron job(s) have not succeeded within their expected window ` +
    `(as of ${asOf}):\n\n` +
    overdue.map((r) => `• ${describe(r)}`).join('\n') +
    `\n\nHealthy jobs:\n` +
    results
      .filter((r) => !r.overdue)
      .map((r) => `• ${describe(r)}`)
      .join('\n');

  const row = (r: CronHealthResult, color: string) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:${color}">${describe(r)}</td></tr>`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:640px">` +
    `<h2 style="color:#b91c1c">⚠️ ${overdue.length} cron job(s) overdue</h2>` +
    `<p style="color:#666">As of ${asOf}. A job is "overdue" if it hasn't succeeded within its expected window.</p>` +
    `<table style="border-collapse:collapse;width:100%">` +
    overdue.map((r) => row(r, '#b91c1c')).join('') +
    results.filter((r) => !r.overdue).map((r) => row(r, '#16a34a')).join('') +
    `</table></div>`;

  return { subject, text, html };
}
