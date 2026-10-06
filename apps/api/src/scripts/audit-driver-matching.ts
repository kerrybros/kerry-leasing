/**
 * DRIVER MATCHING AUDIT
 *
 * Answers "who is getting what, and is it the right person's data?" by running
 * the real weeklyReportBuilder and cross-referencing every produced report
 * against the DriverContact row that would actually receive it.
 *
 * Read-only with one caveat: buildWeeklyReports() reconciles as a side effect —
 * it creates DriverContact rows for unmatched Motive names and backfills a null
 * motiveDriverId. That is exactly what the cron does, so running this BEFORE the
 * send surfaces the reconciliation now rather than mid-blast.
 *
 * Usage: pnpm exec tsx src/scripts/audit-driver-matching.ts --org=<clerkOrgId>
 */

import { getAppPrisma } from '../lib/prisma.js';
import { buildWeeklyReports } from '../features/smsWeeklyReports/weeklyReportBuilder.js';
import { formatSmsBody } from '../features/smsWeeklyReports/smsBodyFormatter.js';
import { decideChannelStatus } from '../features/smsWeeklyReports/reportPolicy.js';

function norm(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  const orgArg = process.argv.find((a) => a.startsWith('--org='));
  const orgId = orgArg ? orgArg.split('=')[1] : undefined;
  if (!orgId) throw new Error('--org=<clerkOrgId> required');

  const prisma = getAppPrisma();
  const problems: string[] = [];

  // ---- 1. Structural integrity on DriverContact ---------------------------
  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId: orgId },
    select: {
      id: true, displayName: true, normalizedName: true, phoneE164: true, email: true,
      motiveDriverId: true, source: true, enrolled: true, optedOut: true,
      smsConsentStatus: true, smsConsentMethod: true, createdAt: true,
    },
  });
  console.log(`Contacts on roster: ${contacts.length}\n`);

  const dupPhone = new Map<string, typeof contacts>();
  const dupMotive = new Map<number, typeof contacts>();
  const dupName = new Map<string, typeof contacts>();
  for (const c of contacts) {
    if (c.phoneE164) dupPhone.set(c.phoneE164, [...(dupPhone.get(c.phoneE164) ?? []), c]);
    if (c.motiveDriverId != null) dupMotive.set(c.motiveDriverId, [...(dupMotive.get(c.motiveDriverId) ?? []), c]);
    dupName.set(c.normalizedName, [...(dupName.get(c.normalizedName) ?? []), c]);
  }

  console.log('=== 1. DUPLICATE CHECKS ===');
  let clean = true;
  for (const [phone, rows] of dupPhone) {
    if (rows.length > 1) {
      clean = false;
      problems.push(`DUPLICATE PHONE ${phone}: ${rows.map((r) => r.displayName).join(' | ')}`);
      console.log(`  ⚠ phone ${phone} shared by ${rows.length}: ${rows.map((r) => r.displayName).join(' | ')}`);
    }
  }
  for (const [mid, rows] of dupMotive) {
    if (rows.length > 1) {
      clean = false;
      problems.push(`DUPLICATE motiveDriverId ${mid}: ${rows.map((r) => r.displayName).join(' | ')}`);
      console.log(`  ⚠ motiveDriverId ${mid} shared by ${rows.length}: ${rows.map((r) => r.displayName).join(' | ')}`);
    }
  }
  for (const [n, rows] of dupName) {
    if (rows.length > 1) {
      clean = false;
      problems.push(`DUPLICATE normalizedName "${n}": ${rows.length} rows`);
      console.log(`  ⚠ name "${n}" appears ${rows.length}x`);
    }
  }
  if (clean) console.log('  ✅ no duplicate phone / motiveDriverId / name');

  const noMotiveId = contacts.filter((c) => c.motiveDriverId == null);
  console.log(`\n  contacts with NO motiveDriverId: ${noMotiveId.length}`);
  for (const c of noMotiveId) {
    console.log(`    ${c.displayName.padEnd(26)} phone=${c.phoneE164 ?? '(none)'} src=${c.source} consent=${c.smsConsentStatus}`);
  }

  // ---- 2. Build the real reports ------------------------------------------
  console.log('\n=== 2. BUILDING REPORTS (live) ===');
  const built = await buildWeeklyReports(orgId);
  console.log(`  week ${built.weekStart} → ${built.weekEnd}`);
  console.log(`  reports produced: ${built.reports.length}`);
  if (built.unmatchedDriverNames?.length) {
    console.log(`  ⚠ Motive names with NO contact at start (rows just created): ${built.unmatchedDriverNames.length}`);
    for (const n of built.unmatchedDriverNames) {
      console.log(`     + ${n}`);
      problems.push(`NEW CONTACT auto-created for unmatched Motive name "${n}" — has no phone, will not receive SMS`);
    }
  } else {
    console.log('  ✅ every Motive driver already had a contact row');
  }

  // ---- 3. Per-report mapping audit ----------------------------------------
  const byId = new Map(contacts.map((c) => [c.id, c]));
  console.log('\n=== 3. WHO GETS WHAT ===');
  console.log('  ' + 'DRIVER'.padEnd(26) + 'PHONE'.padEnd(15) + 'MOTIVE_ID'.padEnd(11) + 'RANK'.padEnd(9) + 'STATUS');
  console.log('  ' + '-'.repeat(78));

  let willSend = 0;
  const suppressed: string[] = [];
  for (const r of built.reports) {
    const c = r.driverContactId ? byId.get(r.driverContactId) : undefined;
    const { status } = decideChannelStatus({
      enrolled: r.enrolled,
      channelOptedOut: r.optedOut,
      isEmail: false,
      smsConsentStatus: r.smsConsentStatus,
      hasRecipient: r.phoneE164 != null,
      dryRun: false,
    });
    if (status === 'QUEUED') willSend++;
    else suppressed.push(`${r.displayName} → ${status}`);

    // Name cross-check: contact matched by motiveDriverId but names disagree =
    // the classic wrong-person-gets-wrong-scorecard case.
    let flag = '';
    if (c && norm(c.displayName) !== norm(r.displayName)) {
      flag = `  ⚠ NAME MISMATCH (contact="${c.displayName}" vs motive="${r.displayName}")`;
      problems.push(`NAME MISMATCH on motiveDriverId ${r.motiveDriverId}: contact "${c.displayName}" vs Motive "${r.displayName}"`);
    }
    if (c && c.motiveDriverId != null && c.motiveDriverId !== r.motiveDriverId) {
      flag += `  ⚠ ID MISMATCH (contact=${c.motiveDriverId} vs report=${r.motiveDriverId})`;
      problems.push(`ID MISMATCH for ${r.displayName}: contact=${c.motiveDriverId} report=${r.motiveDriverId}`);
    }

    const rank = r.noActivity ? 'no-activity' : `${r.rank}/${r.totalDrivers}`;
    console.log(
      '  ' + r.displayName.padEnd(26) +
      (r.phoneE164 ?? '(none)').padEnd(15) +
      String(r.motiveDriverId ?? '-').padEnd(11) +
      rank.padEnd(9) +
      status + flag
    );
  }

  // ---- 4. Confirmed contacts that will receive NOTHING ---------------------
  console.log('\n=== 4. CONFIRMED CONSENT BUT NO REPORT ===');
  const reportContactIds = new Set(built.reports.map((r) => r.driverContactId).filter(Boolean));
  const orphans = contacts.filter(
    (c) => c.smsConsentStatus === 'CONFIRMED' && !reportContactIds.has(c.id)
  );
  if (orphans.length === 0) console.log('  ✅ every consented driver has a report');
  for (const c of orphans) {
    console.log(`  ⚠ ${c.displayName.padEnd(26)} ${c.phoneE164} — consented, no Motive data, gets nothing`);
    problems.push(`ORPHAN: ${c.displayName} is CONFIRMED but has no report`);
  }

  // ---- 5. Exact message bodies --------------------------------------------
  console.log('\n=== 5. SAMPLE MESSAGE BODIES (first 3 that will send) ===');
  let shown = 0;
  for (const r of built.reports) {
    if (shown >= 3) break;
    const { status } = decideChannelStatus({
      enrolled: r.enrolled, channelOptedOut: r.optedOut, isEmail: false,
      smsConsentStatus: r.smsConsentStatus, hasRecipient: r.phoneE164 != null, dryRun: false,
    });
    if (status !== 'QUEUED') continue;
    shown++;
    const body = formatSmsBody({ firstName: r.firstName, noActivity: r.noActivity, reportUrl: 'https://www.kerryleasing.com/r/<token>' });
    console.log(`  → ${r.phoneE164} (${r.displayName}, ${body.length} chars)`);
    console.log(`    "${body}"`);
  }

  // ---- Summary -------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`WILL SEND: ${willSend}   SUPPRESSED: ${suppressed.length}`);
  for (const s of suppressed) console.log(`  - ${s}`);
  console.log(`\nPROBLEMS FOUND: ${problems.length}`);
  for (const p of problems) console.log(`  ! ${p}`);
  if (problems.length === 0) console.log('  ✅ no matching problems detected');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
