/**
 * PREPARE a weekly-scorecard correction. READ-ONLY. Sends nothing, writes nothing.
 *
 * Context: the weekly cron sent the week of 2026-09-14 from the v2/driver_utilization
 * API, which under-counts low-speed driving time and therefore overstates idle % on
 * yard trucks. Motive's Driver Fuel Performance report is the source of truth
 * (support case 11057761). This script rebuilds each driver's frozen scorecard
 * snapshot from report-backed data and lays out exactly what a correction would
 * change, so a human can review before anything is applied or sent.
 *
 * It reads corrected figures from APP_DATABASE_URL (a database that HAS the report
 * tables and ingested report rows) and the already-sent rows from CORRECTION_PROD_URL
 * (read-only). Outputs land in a directory for review.
 *
 *   APP_DATABASE_URL=<report-backed db> CORRECTION_PROD_URL=<live db> \
 *     pnpm exec tsx src/scripts/prepare-scorecard-correction.ts \
 *       --org=<clerkOrgId> --week=2026-09-14 --out=../../corrections/2026-09-14
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '../generated/app-client/index.js';
import { getAppPrisma } from '../lib/prisma.js';
import { buildWeeklyReports } from '../features/smsWeeklyReports/weeklyReportBuilder.js';
import { buildKpiSnapshot } from '../features/smsWeeklyReports/sendOrgWeeklyReports.js';
import { TelematicsService } from '../services/telematicsService.js';
import { config } from '../config.js';

/** Idle-point change at or above which a driver is worth actually texting. */
const MATERIAL_IDLE_PTS = 5;

function arg(n: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
}

function correctionSms(firstName: string, weekLabel: string, url: string): string {
  return `Hi ${firstName}, correction to your ${weekLabel} scorecard: your idle time was overstated. Your updated numbers are here: ${url}`;
}

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** "Sep 14-20" for a Mon..Sun pair, or "Sep 28-Oct 4" when it straddles a month. */
function humanWeek(startYmd: string, endYmd: string): string {
  const [, sm, sd] = startYmd.split('-').map(Number);
  const [, em, ed] = endYmd.split('-').map(Number);
  return sm === em
    ? `${MON[sm - 1]} ${sd}-${ed}`
    : `${MON[sm - 1]} ${sd}-${MON[em - 1]} ${ed}`;
}

async function main() {
  const org = arg('org');
  const week = arg('week');
  const out = arg('out') ?? `../../corrections/${week}`;
  const prodUrl = process.env.CORRECTION_PROD_URL;
  if (!org || !week) throw new Error('--org=<clerkOrgId> and --week=YYYY-MM-DD (Monday) required');
  if (!prodUrl) throw new Error('CORRECTION_PROD_URL must point at the live database (read-only here)');

  // 1. Corrected figures, from the report-backed database. The builder always
  // reports on the week BEFORE the date it is given, so anchor it to the Monday
  // after the week being corrected.
  const anchor = new Date(`${week}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + 7);
  const built = await buildWeeklyReports(org, anchor);
  if (built.weekStart !== week) {
    throw new Error(`Builder produced week ${built.weekStart}, expected ${week}. --week must be the Monday of the week being corrected.`);
  }
  const card = await new TelematicsService().getDriverScorecard(org, built.weekStart, built.weekEnd);
  const source = (card as any).source;
  if (source !== 'MOTIVE_REPORT') {
    throw new Error(`Refusing to prepare: corrected figures came from ${source}, not MOTIVE_REPORT. Import the report windows for ${built.weekStart}..${built.weekEnd} first.`);
  }
  const byContact = new Map(built.reports.filter((r) => r.driverContactId).map((r) => [r.driverContactId, r]));

  // 2. What was actually sent, read-only from the live database.
  const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  const sent = await prod.driverWeeklyReportSent.findMany({
    where: { clerkOrgId: org, weekStartDate: week },
    select: {
      id: true, driverContactId: true, channel: true, status: true, token: true,
      tokenExpiresAt: true, sentAt: true, kpiSnapshot: true,
    },
  }) as any[];
  // DriverWeeklyReportSent has no relation to DriverContact, so join by hand.
  const contactRows = await prod.driverContact.findMany({
    where: { id: { in: sent.map((r) => r.driverContactId) } },
    select: { id: true, displayName: true, phoneE164: true, smsConsentStatus: true, optedOut: true },
  });
  const contactById = new Map(contactRows.map((c) => [c.id, c]));

  const weekLabel = humanWeek(built.weekStart, built.weekEnd);
  const base = config.reportPublicBaseUrl.replace(/\/$/, '');
  const backup: any[] = [];
  const changes: any[] = [];
  const recipients: any[] = [];
  const skipped: any[] = [];

  for (const row of sent) {
    const fresh = byContact.get(row.driverContactId);
    const contact = contactById.get(row.driverContactId);
    const name = contact?.displayName ?? row.driverContactId;
    if (!fresh) { skipped.push({ name, reason: 'no corrected report for this contact' }); continue; }

    backup.push({ id: row.id, driverContactId: row.driverContactId, channel: row.channel, kpiSnapshot: row.kpiSnapshot });

    const oldSnap: any = row.kpiSnapshot ?? {};
    const newSnap: any = buildKpiSnapshot(fresh);
    const oldIdle = oldSnap?.current?.idlePct ?? null;
    const newIdle = newSnap?.current?.idlePct ?? null;
    const deltaPts = oldIdle != null && newIdle != null ? +(newIdle - oldIdle).toFixed(1) : null;

    changes.push({
      id: row.id, driverContactId: row.driverContactId, name, channel: row.channel, status: row.status,
      oldIdlePct: oldIdle, newIdlePct: newIdle, idleDeltaPts: deltaPts,
      oldIdleRank: oldSnap?.idleRank ?? null, newIdleRank: newSnap.idleRank,
      oldIdleFuelGal: oldSnap?.current?.idleFuelGal ?? null, newIdleFuelGal: newSnap.current?.idleFuelGal ?? null,
      kpiSnapshot: newSnap,
    });

    const material = deltaPts != null && Math.abs(deltaPts) >= MATERIAL_IDLE_PTS;
    const reachable = row.status === 'DELIVERED' || row.status === 'SENT';
    const consented = contact?.smsConsentStatus === 'CONFIRMED' && !contact?.optedOut;
    const phone = contact?.phoneE164 ?? null;
    const live = row.tokenExpiresAt > new Date();
    if (material && reachable && consented && phone && live && row.channel === 'SMS') {
      const url = `${base}/r/${row.token}`;
      const body = correctionSms(fresh.firstName, weekLabel, url);
      recipients.push({
        name, driverContactId: row.driverContactId, phoneE164: phone,
        oldIdlePct: oldIdle, newIdlePct: newIdle, idleDeltaPts: deltaPts,
        reportUrl: url, body, segments: Math.ceil(body.length / 153), chars: body.length,
      });
    } else if (material) {
      skipped.push({ name, reason: `material change but not textable (status=${row.status}, consent=${contact?.smsConsentStatus}, phone=${!!phone}, linkLive=${live})` });
    }
  }

  const dir = path.resolve(out);
  fs.mkdirSync(dir, { recursive: true });
  const w = (f: string, data: unknown) => fs.writeFileSync(path.join(dir, f), JSON.stringify(data, null, 1));
  w('backup-snapshots.json', { org, week, capturedAt: new Date().toISOString(), rows: backup });
  w('corrected-snapshots.json', { org, week, source, preparedAt: new Date().toISOString(), rows: changes });
  w('recipients.json', { org, week, materialIdlePts: MATERIAL_IDLE_PTS, count: recipients.length, recipients });
  fs.writeFileSync(path.join(dir, 'recipients.csv'),
    'driver,phone,old_idle_pct,new_idle_pct,delta_pts,chars,segments,message\n' +
    recipients.map((r) => [r.name, r.phoneE164, r.oldIdlePct, r.newIdlePct, r.idleDeltaPts, r.chars, r.segments, JSON.stringify(r.body)].join(',')).join('\n') + '\n');

  const mask = (p: string) => `***${p.slice(-4)}`;
  console.log(`\nCorrection prepared for ${org}, week ${built.weekStart} to ${built.weekEnd}`);
  console.log(`corrected figures source: ${source}`);
  console.log(`sent rows found: ${sent.length}   snapshots that would change: ${changes.length}`);
  console.log(`\nSnapshot rewrite (every link corrected, no message sent):`);
  for (const c of changes.filter((c) => c.idleDeltaPts != null && Math.abs(c.idleDeltaPts) >= MATERIAL_IDLE_PTS).sort((a, b) => a.idleDeltaPts - b.idleDeltaPts)) {
    console.log(`   ${c.name.padEnd(24)} idle ${String(c.oldIdlePct).padStart(5)} -> ${String(c.newIdlePct).padStart(5)}  (${c.idleDeltaPts > 0 ? '+' : ''}${c.idleDeltaPts} pts)   rank ${c.oldIdleRank} -> ${c.newIdleRank}`);
  }
  const minor = changes.length - changes.filter((c) => c.idleDeltaPts != null && Math.abs(c.idleDeltaPts) >= MATERIAL_IDLE_PTS).length;
  console.log(`   ...and ${minor} more with a change under ${MATERIAL_IDLE_PTS} points`);
  console.log(`\nText message would go to ${recipients.length} driver(s):`);
  for (const r of recipients) console.log(`   ${r.name.padEnd(24)} ${mask(r.phoneE164)}  ${r.chars} chars / ${r.segments} segment(s)`);
  if (recipients.length) console.log(`\nExact wording (identical for all, name and link vary):\n   "${recipients[0].body.replace(recipients[0].reportUrl, base + '/r/<their own token>')}"`);
  if (skipped.length) { console.log(`\nNot texted:`); for (const s of skipped) console.log(`   ${s.name}: ${s.reason}`); }
  console.log(`\nFiles written to ${dir}`);
  console.log(`NOTHING was sent and NOTHING was written to the live database.`);
  await prod.$disconnect();
  await getAppPrisma().$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
