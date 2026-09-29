/**
 * Driver reachability check: who is driving but will never get a scorecard?
 *
 * Pure and dependency-free (no config, no prisma) so the rules and the alert
 * text are unit-tested in isolation. The caller gathers the data.
 *
 * This exists because two drivers went unreported for months and nothing said
 * so. Ezekiel King-Davis and Jamie Shell both had their phone numbers held by
 * departed drivers, so the Whiparound sync dropped their number on a unique
 * constraint, logged a console warning nobody reads, and carried on. Every
 * weekly run then skipped them in silence. It surfaced only when the customer
 * happened to ask.
 *
 * The lesson is not "handle that one constraint better". It is that a driver
 * who is working but unreachable has to be noisy. Anything that keeps a real
 * driver off the weekly report belongs in this check.
 */

/** Why a driver who is out working cannot receive their scorecard. */
export type UnreachableReason =
  | 'no-contact-record'
  | 'no-phone'
  | 'no-consent'
  | 'opted-out'
  | 'not-enrolled';

export interface DriverReachabilityInput {
  clerkOrgId: string;
  motiveDriverId: number;
  displayName: string;
  /** Days in the lookback window on which this driver had engine time. */
  activeDays: number;
  hasContact: boolean;
  hasPhone: boolean;
  enrolled: boolean;
  optedOut: boolean;
  consentConfirmed: boolean;
}

export interface UnreachableDriver {
  clerkOrgId: string;
  motiveDriverId: number;
  displayName: string;
  activeDays: number;
  reason: UnreachableReason;
}

/** A phone number sitting on a contact whose Motive driver has left. */
export interface StalePhoneHolder {
  clerkOrgId: string;
  displayName: string;
  phoneLast4: string;
  motiveStatus: string | null;
}

export interface DriverReachabilityReport {
  lookbackDays: number;
  driversChecked: number;
  unreachable: UnreachableDriver[];
  stalePhoneHolders: StalePhoneHolder[];
}

export const REASON_TEXT: Record<UnreachableReason, string> = {
  'no-contact-record': 'no driver contact exists for them',
  'no-phone': 'no phone number on file',
  'no-consent': 'SMS consent not confirmed',
  'opted-out': 'opted out of messages',
  'not-enrolled': 'not enrolled for reports',
};

/**
 * First blocking reason per driver, most fundamental first, so the alert says
 * the thing to fix rather than a symptom of it.
 */
export function reasonFor(d: DriverReachabilityInput): UnreachableReason | null {
  if (!d.hasContact) return 'no-contact-record';
  if (!d.enrolled) return 'not-enrolled';
  if (d.optedOut) return 'opted-out';
  if (!d.hasPhone) return 'no-phone';
  if (!d.consentConfirmed) return 'no-consent';
  return null;
}

export function evaluateDriverReachability(
  drivers: DriverReachabilityInput[],
  stalePhoneHolders: StalePhoneHolder[],
  lookbackDays: number
): DriverReachabilityReport {
  const unreachable: UnreachableDriver[] = [];
  for (const d of drivers) {
    const reason = reasonFor(d);
    if (reason) {
      unreachable.push({
        clerkOrgId: d.clerkOrgId,
        motiveDriverId: d.motiveDriverId,
        displayName: d.displayName,
        activeDays: d.activeDays,
        reason,
      });
    }
  }
  // Worst first: most days driven without ever hearing from us.
  unreachable.sort((a, b) => b.activeDays - a.activeDays || a.displayName.localeCompare(b.displayName));
  return { lookbackDays, driversChecked: drivers.length, unreachable, stalePhoneHolders };
}

export interface ReachabilityAlert {
  subject: string;
  text: string;
  html: string;
}

/** Null when every working driver can be reached and no phone looks stranded. */
export function formatReachabilityAlert(r: DriverReachabilityReport): ReachabilityAlert | null {
  if (r.unreachable.length === 0 && r.stalePhoneHolders.length === 0) return null;

  const n = r.unreachable.length;
  const subject =
    n > 0
      ? `Kerry Leasing: ${n} driver${n === 1 ? '' : 's'} working but not receiving scorecards`
      : `Kerry Leasing: ${r.stalePhoneHolders.length} phone number${r.stalePhoneHolders.length === 1 ? '' : 's'} on a departed driver`;

  const line = (u: UnreachableDriver) =>
    `${u.displayName} drove ${u.activeDays} day${u.activeDays === 1 ? '' : 's'} in the last ${r.lookbackDays}, ${REASON_TEXT[u.reason]}`;
  const stale = (s: StalePhoneHolder) =>
    `${s.displayName} holds a number ending ${s.phoneLast4} but is ${s.motiveStatus ?? 'unknown'} in Motive`;

  const parts: string[] = [];
  if (n > 0) {
    parts.push(
      `${n} driver(s) had engine time in the last ${r.lookbackDays} days but cannot receive a weekly scorecard:\n\n` +
        r.unreachable.map((u) => `• ${line(u)}`).join('\n')
    );
  }
  if (r.stalePhoneHolders.length > 0) {
    parts.push(
      `Phone numbers held by drivers who have left Motive. If the number was reissued, ` +
        `clearing it in Whiparound lets it reach whoever carries it now:\n\n` +
        r.stalePhoneHolders.map((s) => `• ${stale(s)}`).join('\n')
    );
  }
  parts.push(`Checked ${r.driversChecked} active driver(s). Fix phones and consent in Admin > SMS Reports.`);
  const text = parts.join('\n\n');

  const ul = (items: string[]) =>
    `<ul style="margin:8px 0 0;padding-left:20px">${items.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:640px">` +
    (n > 0
      ? `<h2 style="color:#b91c1c;margin-bottom:4px">${n} driver(s) working but not receiving scorecards</h2>` +
        `<p style="color:#444;margin:0">Engine time in the last ${r.lookbackDays} days, but no weekly report can reach them.</p>` +
        ul(r.unreachable.map(line))
      : '') +
    (r.stalePhoneHolders.length > 0
      ? `<h3 style="color:#92400e;margin-bottom:4px">Numbers held by departed drivers</h3>` +
        `<p style="color:#444;margin:0">If reissued, clear it in Whiparound so it reaches whoever carries it now.</p>` +
        ul(r.stalePhoneHolders.map(stale))
      : '') +
    `<p style="color:#666;font-size:13px;margin-top:16px">Checked ${r.driversChecked} active driver(s). ` +
    `Fix phones and consent in Admin &gt; SMS Reports.</p></div>`;

  return { subject, text, html };
}
