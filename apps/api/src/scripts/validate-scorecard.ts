/**
 * Validate the rebuilt scorecard end-to-end via the REAL service code path.
 * Read-only. pnpm exec tsx --env-file=.env src/scripts/validate-scorecard.ts
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/app-client/index.js');
import { TelematicsService } from '../services/telematicsService.js';
import { SAFETY_EVENT_WEIGHTS, weightedEventTotal, safetyScoreFromRate } from '../services/safetyScore.js';

const db = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } });
const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400_000);
  const startDate = ymd(start), endDate = ymd(end);

  const svc = new TelematicsService();
  const res = await svc.getDriverScorecard(ORG, startDate, endDate);
  const rows = res.data;
  console.log(`Scorecard ${startDate}..${endDate}: ${rows.length} drivers, fleetAvgMpg=${res.fleetAvgMpg}`);

  const scores = rows.map((r: any) => r.score).sort((a: number, b: number) => a - b);
  const safety = rows.map((r: any) => r.subScores.safety).sort((a: number, b: number) => a - b);
  const idle = rows.map((r: any) => r.subScores.idle).sort((a: number, b: number) => a - b);
  const mpg = rows.map((r: any) => r.subScores.mpg).sort((a: number, b: number) => a - b);
  const p = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.floor(q / 100 * a.length))] : 0;
  const line = (name: string, a: number[]) =>
    console.log(`  ${name.padEnd(7)} p10/p50/p90/min/max = ${p(a,10)}/${p(a,50)}/${p(a,90)}/${a[0]}/${a[a.length-1]}`);
  console.log('\nDistribution (composite = idle .40 / mpg .35 / safety .25):');
  line('score', scores); line('safety', safety); line('idle', idle); line('mpg', mpg);

  const grades: Record<string, number> = {};
  rows.forEach((r: any) => { grades[r.grade] = (grades[r.grade] ?? 0) + 1; });
  console.log('  grades:', grades);

  // Independent recompute of safety for the top-event driver → must match service.
  const events = await db.motiveDriverPerformanceEvent.findMany({
    where: { clerkOrgId: ORG, date: { gte: startDate, lte: endDate }, driverId: { not: null } },
    select: { driverId: true, eventType: true, severity: true },
  });
  const periods = await db.motiveDrivingPeriod.findMany({
    where: { clerkOrgId: ORG, date: { gte: startDate, lte: endDate }, driverId: { not: null } },
    select: { driverId: true, distance: true },
  });
  const wByD = new Map<number, number>(), mById = new Map<number, number>();
  for (const e of events) {
    if (e.driverId == null || !SAFETY_EVENT_WEIGHTS[e.eventType]) continue;
    const k = Number(e.driverId);
    wByD.set(k, (wByD.get(k) ?? 0) + weightedEventTotal([{ eventType: e.eventType, severity: e.severity }]));
  }
  for (const pr of periods) {
    if (pr.driverId == null || !pr.distance) continue;
    const k = Number(pr.driverId);
    mById.set(k, (mById.get(k) ?? 0) + (parseFloat(pr.distance) || 0));
  }
  const worst = [...wByD.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst) {
    const [did, w] = worst;
    const miles = mById.get(did) ?? 0;
    const independent = Math.round(safetyScoreFromRate(w, miles));
    const fromSvc = rows.find((r: any) => r.driverId === did);
    console.log(`\nSpot-check driver ${did}: weighted=${w.toFixed(1)}, miles=${miles.toFixed(0)}`);
    console.log(`  independent safety=${independent}  | service safety=${fromSvc?.subScores.safety}  ` +
      `→ ${independent === fromSvc?.subScores.safety ? 'MATCH ✓' : 'MISMATCH ✗'}`);
    console.log(`  service row: score=${fromSvc?.score} grade=${fromSvc?.grade} hardEvents=${fromSvc?.hardEvents} breakdown=`, fromSvc?.hardEventBreakdown);
  }
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
