/**
 * FULL ROSTER MATCH REPORT
 *
 * Every DriverContact for an org, matched or not, with the Motive identity it
 * resolves to and whether the two emails agree.
 *
 * NOTE ON MATCHING: the builder matches on motiveDriverId first, then on an
 * EXACT normalized name (lowercase, collapsed whitespace). Email is NOT a
 * matching key — it is shown here as an independent cross-check that the
 * motiveDriverId on a contact points at the right human.
 *
 * Usage: pnpm exec tsx src/scripts/roster-match-report.ts --org=<clerkOrgId>
 */

import { getAppPrisma } from '../lib/prisma.js';
import { buildWeeklyReports } from '../features/smsWeeklyReports/weeklyReportBuilder.js';
import { decideChannelStatus } from '../features/smsWeeklyReports/reportPolicy.js';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

async function main() {
  const orgArg = process.argv.find((a) => a.startsWith('--org='));
  const orgId = orgArg ? orgArg.split('=')[1] : undefined;
  if (!orgId) throw new Error('--org=<clerkOrgId> required');
  const prisma = getAppPrisma();

  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId: orgId },
    select: {
      id: true, displayName: true, phoneE164: true, email: true, motiveDriverId: true,
      whiparoundDriverId: true, source: true, enrolled: true, optedOut: true,
      smsConsentStatus: true,
    },
  });

  // Latest known Motive identity per driverId (any date, not just last week).
  const mu = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId: orgId },
    select: { driverId: true, driverFirstName: true, driverLastName: true, driverEmail: true },
    distinct: ['driverId'],
  });
  const motiveById = new Map(mu.filter((m) => m.driverId != null).map((m) => [m.driverId!, m]));

  // Who actually produces a report this week (live build — same as the cron).
  const built = await buildWeeklyReports(orgId);
  const reportByContact = new Map(
    built.reports.filter((r) => r.driverContactId).map((r) => [r.driverContactId!, r])
  );

  type Row = { order: number; line: string; outcome: string };
  const rows: Row[] = [];

  for (const c of contacts) {
    const m = c.motiveDriverId != null ? motiveById.get(c.motiveDriverId) : undefined;
    const motiveName = m ? `${m.driverFirstName ?? ''} ${m.driverLastName ?? ''}`.trim() : '';
    const cEmail = c.email?.trim().toLowerCase() ?? null;
    const mEmail = m?.driverEmail?.trim().toLowerCase() ?? null;

    let emailFlag: string;
    if (!c.motiveDriverId) emailFlag = 'NO-ID';
    else if (!cEmail || !mEmail) emailFlag = 'n/a';
    else if (cEmail === mEmail) emailFlag = 'MATCH';
    else emailFlag = 'DIFFER';

    const nameFlag = m && motiveName && norm(motiveName) !== norm(c.displayName) ? ' *' : '';

    const rpt = reportByContact.get(c.id);
    let outcome: string, order: number;
    if (rpt) {
      const { status } = decideChannelStatus({
        enrolled: rpt.enrolled, channelOptedOut: rpt.optedOut, isEmail: false,
        smsConsentStatus: rpt.smsConsentStatus, hasRecipient: rpt.phoneE164 != null, dryRun: false,
      });
      if (status === 'QUEUED') { outcome = 'SEND'; order = 0; }
      else { outcome = `skip:${status}`; order = 1; }
    } else if (!c.phoneE164) { outcome = 'no phone'; order = 3; }
    else { outcome = 'silent: no activity'; order = 2; }

    rows.push({
      order,
      outcome,
      line:
        pad(c.displayName + nameFlag, 26) +
        pad(c.phoneE164 ?? '—', 14) +
        pad(c.email ?? '—', 32) +
        pad(String(c.motiveDriverId ?? '—'), 10) +
        pad(motiveName || '—', 24) +
        pad(emailFlag, 8) +
        outcome,
    });
  }

  rows.sort((a, b) => a.order - b.order || a.line.localeCompare(b.line));

  console.log(`ROSTER — ${contacts.length} contacts | week ${built.weekStart} → ${built.weekEnd}`);
  console.log('Matching key = motiveDriverId, then exact normalized name. EMAIL column is a cross-check only.');
  console.log('* = contact displayName differs from Motive name\n');
  console.log(
    pad('DRIVER', 26) + pad('PHONE', 14) + pad('CONTACT EMAIL', 32) +
    pad('MOTIVE_ID', 10) + pad('MOTIVE NAME', 24) + pad('EMAIL', 8) + 'TOMORROW'
  );
  console.log('-'.repeat(130));
  let last = -1;
  for (const r of rows) {
    if (r.order !== last && last !== -1) console.log('');
    last = r.order;
    console.log(r.line);
  }

  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
  console.log('\n' + '='.repeat(130));
  for (const [k, v] of [...tally].sort()) console.log(`  ${pad(k, 24)} ${v}`);
  const emailIssues = rows.filter((r) => r.line.includes('DIFFER')).length;
  const noId = rows.filter((r) => r.line.includes('NO-ID')).length;
  console.log(`\n  email DIFFER (wrong-person risk): ${emailIssues}`);
  console.log(`  contacts with no motiveDriverId:  ${noId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
