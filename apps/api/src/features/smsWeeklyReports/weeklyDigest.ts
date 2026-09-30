/**
 * WEEKLY SEND DIGEST
 *
 * The operator-facing counterpart to the driver cards: after the weekly run,
 * one email saying who was sent what, who is new, and what looks wrong.
 *
 * This exists because the send itself is silent when it works and, until the
 * reachability watchdog, was nearly silent when it did not. A driver could be
 * skipped for months without anyone seeing it. The digest makes every run
 * visible on its own terms: the numbers that went out, not a re-derivation of
 * them afterwards, so what this reports is exactly what the drivers received.
 *
 * Pure: takes the send results and returns text. No I/O, so the thresholds and
 * the wording are testable without sending anything.
 */

import type { WeeklyDigestDriver, SendOrgResult } from './sendOrgWeeklyReports.js';

/**
 * Outlier thresholds. These are deliberately blunt: the digest is a daily-glance
 * document, so it should surface the handful of rows worth a second look, not
 * every ordinary wobble. A driver's week naturally moves a few points either
 * way, so the bar is set where a human would actually say "that is odd".
 */
export const SCORE_SWING_POINTS = 15;
export const IDLE_SWING_PCT_POINTS = 15;

export type OutlierKind =
  | 'send-failed'
  | 'not-sent'
  | 'score-swing'
  | 'idle-swing'
  | 'stopped-working';

export interface DigestOutlier {
  displayName: string;
  kind: OutlierKind;
  detail: string;
}

export interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  orgCount: number;
  sentCount: number;
  failedCount: number;
  notSentCount: number;
  drivers: WeeklyDigestDriver[];
  newDrivers: WeeklyDigestDriver[];
  outliers: DigestOutlier[];
  errors: string[];
}

function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

/** A driver on their first week of data has nothing to compare against yet. */
function isNew(d: WeeklyDigestDriver): boolean {
  return d.weeksOfData <= 1;
}

export function buildWeeklyDigest(results: SendOrgResult[]): WeeklyDigest {
  const drivers = results.flatMap((r) => r.digest);
  const errors = results.filter((r) => r.error).map((r) => `${r.clerkOrgId}: ${r.error}`);
  const outliers: DigestOutlier[] = [];

  for (const d of drivers) {
    const failed = d.channels.filter((c) => c.status === 'FAILED');
    if (failed.length > 0) {
      outliers.push({
        displayName: d.displayName,
        kind: 'send-failed',
        detail: failed.map((c) => `${c.channel} failed: ${c.error ?? 'no reason given'}`).join('; '),
      });
    } else if (d.channels.length === 0) {
      outliers.push({
        displayName: d.displayName,
        kind: 'not-sent',
        detail: d.suppressedReason ?? 'nothing was sent and no reason was recorded',
      });
    }

    // A driver with history who did no work this week. Worth a look: it is
    // either time off, or a truck or tracker that stopped reporting.
    if (d.noActivity && !isNew(d)) {
      outliers.push({ displayName: d.displayName, kind: 'stopped-working', detail: 'no activity this week' });
      continue; // the swing numbers below are meaningless against a blank week
    }

    // Swings are only meaningful once there is an average to swing against.
    if (!isNew(d)) {
      if (Math.abs(d.scoreVsAvg) >= SCORE_SWING_POINTS) {
        outliers.push({
          displayName: d.displayName,
          kind: 'score-swing',
          detail: `score ${d.score.toFixed(0)}, ${signed(d.scoreVsAvg, 0)} vs their 4 week average`,
        });
      }
      if (Math.abs(d.idlePctPtsVsAvg) >= IDLE_SWING_PCT_POINTS) {
        outliers.push({
          displayName: d.displayName,
          kind: 'idle-swing',
          detail: `idle ${d.idlePct.toFixed(1)}%, ${signed(d.idlePctPtsVsAvg)} points vs their 4 week average`,
        });
      }
    }
  }

  const sentCount = drivers.filter((d) => d.channels.some((c) => c.status === 'SENT' || c.status === 'DELIVERED')).length;
  const failedCount = drivers.filter((d) => d.channels.some((c) => c.status === 'FAILED')).length;
  const notSentCount = drivers.filter((d) => d.channels.length === 0).length;

  return {
    weekStart: results[0]?.weekStart ?? '',
    weekEnd: results[0]?.weekEnd ?? '',
    orgCount: results.length,
    sentCount,
    failedCount,
    notSentCount,
    drivers,
    newDrivers: drivers.filter(isNew),
    outliers,
    errors,
  };
}

const KIND_LABEL: Record<OutlierKind, string> = {
  'send-failed': 'Send failed',
  'not-sent': 'Not sent',
  'score-swing': 'Score swing',
  'idle-swing': 'Idle swing',
  'stopped-working': 'No activity',
};

export function formatWeeklyDigestSubject(d: WeeklyDigest): string {
  const problems = d.failedCount + d.notSentCount + d.errors.length;
  const flag = problems > 0 ? `${problems} need a look` : 'all clean';
  return `Driver reports ${d.weekStart} to ${d.weekEnd}: ${d.sentCount} sent, ${flag}`;
}

export function formatWeeklyDigestText(d: WeeklyDigest): string {
  const lines: string[] = [];
  lines.push(`Week ${d.weekStart} to ${d.weekEnd}`);
  lines.push(`${d.sentCount} driver(s) received a report. ${d.failedCount} failed, ${d.notSentCount} not sent.`);

  if (d.errors.length > 0) {
    lines.push('', 'RUN ERRORS');
    for (const e of d.errors) lines.push(`  ${e}`);
  }

  if (d.newDrivers.length > 0) {
    lines.push('', `NEW THIS WEEK (${d.newDrivers.length})`);
    for (const n of d.newDrivers) {
      lines.push(`  ${n.displayName}: first week of data, score ${n.score.toFixed(0)}, idle ${n.idlePct.toFixed(1)}%`);
    }
  }

  if (d.outliers.length > 0) {
    lines.push('', `WORTH A LOOK (${d.outliers.length})`);
    for (const o of d.outliers) lines.push(`  ${KIND_LABEL[o.kind]}: ${o.displayName}, ${o.detail}`);
  } else {
    lines.push('', 'Nothing looked out of place.');
  }

  lines.push('', `WHO WAS SENT WHAT (${d.drivers.length})`);
  for (const dr of [...d.drivers].sort((a, b) => b.score - a.score)) {
    const chans = dr.channels.length
      ? dr.channels.map((c) => `${c.channel}:${c.status}`).join(' ')
      : `NOT SENT (${dr.suppressedReason ?? 'no reason recorded'})`;
    const delta = isNew(dr) ? 'new' : `${signed(dr.scoreVsAvg, 0)} vs avg`;
    lines.push(
      `  ${dr.displayName.padEnd(24)} score ${String(dr.score.toFixed(0)).padStart(3)} ` +
        `idle ${String(dr.idlePct.toFixed(1)).padStart(5)}%  ${delta.padEnd(12)} ${chans}`,
    );
  }
  return lines.join('\n');
}
