/**
 * Repair driver_weekly_reports_sent rows whose stored status disagrees with
 * Twilio. Twilio is the authority for what a driver actually received.
 *
 * Needed because a dry run used to upsert onto the SAME row as the real send
 * (the key is org + driver + week + channel) and overwrote its status with
 * SKIPPED, leaving the Twilio SID behind. The week of 2026-09-21 read as 0
 * delivered in our table while Twilio had 35 delivered. The cause is fixed in
 * sendOrgWeeklyReports; this repairs rows damaged before that.
 *
 * Only rows that HAVE a Twilio SID are touched, and only to match what Twilio
 * reports, so this can never invent a delivery that did not happen.
 *
 *   pnpm exec tsx src/scripts/repair-send-status-from-twilio.ts --week=2026-09-21 [--apply]
 */
import { getAppPrisma } from '../lib/prisma.js';

const TWILIO_TO_STATUS: Record<string, string> = {
  delivered: 'DELIVERED',
  sent: 'SENT',
  failed: 'FAILED',
  undelivered: 'FAILED',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const week = process.argv.find((a) => a.startsWith('--week='))?.split('=')[1];
  if (!week) throw new Error('--week=YYYY-MM-DD is required');

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  const auth = 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64');

  const prisma = getAppPrisma();
  const rows = await prisma.driverWeeklyReportSent.findMany({
    where: { weekStartDate: week, twilioSid: { not: null } },
    select: { id: true, twilioSid: true, status: true },
  });
  console.log(`[repair] week ${week}: ${rows.length} row(s) with a Twilio SID. apply=${apply}`);

  let changed = 0;
  let agreed = 0;
  const unknown: string[] = [];
  for (const r of rows) {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${r.twilioSid}.json`, {
      headers: { Authorization: auth },
    });
    if (!resp.ok) { unknown.push(`${r.twilioSid}: HTTP ${resp.status}`); continue; }
    const m: any = await resp.json();
    const target = TWILIO_TO_STATUS[String(m.status)];
    if (!target) { unknown.push(`${r.twilioSid}: twilio status ${m.status}`); continue; }
    if (target === r.status) { agreed++; continue; }
    console.log(`  ${r.twilioSid}: ours=${r.status} -> twilio=${target}`);
    if (apply) {
      await prisma.driverWeeklyReportSent.update({ where: { id: r.id }, data: { status: target as any } });
    }
    changed++;
  }
  console.log(`[repair] agreed=${agreed} ${apply ? 'repaired' : 'would repair'}=${changed} unresolved=${unknown.length}`);
  for (const u of unknown) console.log(`  unresolved ${u}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
