/**
 * Calibrate SAFETY_RATE_DECAY against the fleet's actual weighted-events-per-
 * 1,000-mi distribution, so the 0–100 safety sub-score spreads sensibly instead
 * of clumping at 0/100. Read-only.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/calibrate-safety.ts [days]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/app-client/index.js');
import { SAFETY_EVENT_WEIGHTS, weightedEventTotal } from '../services/safetyScore.js';

const db = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } });

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function main() {
  const days = parseInt(process.argv[2] ?? '90', 10);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = ymd(start), endDate = ymd(end);

  const orgs: string[] = (
    await db.telematicsProviderAccount.findMany({ where: { provider: 'MOTIVE' }, select: { clerkOrgId: true } })
  ).map((a: any) => a.clerkOrgId);

  const allRates: number[] = [];
  for (const org of orgs) {
    const events = await db.motiveDriverPerformanceEvent.findMany({
      where: { clerkOrgId: org, date: { gte: startDate, lte: endDate }, driverId: { not: null } },
      select: { driverId: true, eventType: true, severity: true },
    });
    const periods = await db.motiveDrivingPeriod.findMany({
      where: { clerkOrgId: org, date: { gte: startDate, lte: endDate }, driverId: { not: null } },
      select: { driverId: true, distance: true },
    });

    const milesByDriver = new Map<string, number>();
    for (const p of periods) {
      if (p.driverId == null || !p.distance) continue;
      const k = String(p.driverId);
      milesByDriver.set(k, (milesByDriver.get(k) ?? 0) + (parseFloat(p.distance) || 0));
    }
    const weightedByDriver = new Map<string, number>();
    for (const e of events) {
      if (e.driverId == null) continue;
      if (!SAFETY_EVENT_WEIGHTS[e.eventType]) continue;
      const k = String(e.driverId);
      weightedByDriver.set(
        k,
        (weightedByDriver.get(k) ?? 0) + weightedEventTotal([{ eventType: e.eventType, severity: e.severity }]),
      );
    }

    let drivers = 0;
    for (const [k, miles] of milesByDriver) {
      if (miles < 100) continue; // ignore negligible-mileage drivers (noise)
      drivers++;
      const w = weightedByDriver.get(k) ?? 0;
      allRates.push(w / (miles / 1000));
    }
    console.log(`${org}: ${events.length} events, ${drivers} drivers ≥100mi (${startDate}..${endDate})`);
  }

  allRates.sort((a, b) => a - b);
  const P = [10, 25, 50, 75, 90, 95, 100];
  console.log('\nweighted-events-per-1,000-mi distribution:');
  for (const p of P) console.log(`  p${p}: ${pct(allRates, p).toFixed(2)}`);
  const zero = allRates.filter((r) => r === 0).length;
  console.log(`  drivers with 0 weighted events: ${zero}/${allRates.length}`);

  // Pick DECAY so the median driver scores ~80 (100·exp(-r50/DECAY)=80).
  const r50 = pct(allRates, 50);
  const r75 = pct(allRates, 75);
  const target = 80;
  const decayFromMedian = r50 > 0 ? -r50 / Math.log(target / 100) : null;
  console.log(`\nmedian rate r50=${r50.toFixed(2)}, r75=${r75.toFixed(2)}`);
  console.log(
    decayFromMedian
      ? `Suggested SAFETY_RATE_DECAY ≈ ${decayFromMedian.toFixed(1)} (median driver → ${target})`
      : 'Median rate is 0 — most drivers event-free; pick DECAY off p75/p90 instead.',
  );

  for (const decay of [decayFromMedian ?? 0, 15, 25, 40, 60].filter((d) => d > 0)) {
    const sc = (r: number) => Math.round(100 * Math.exp(-r / decay));
    console.log(
      `  DECAY=${decay.toFixed(1)} → score p10/p50/p90/p95 = ` +
        `${sc(pct(allRates, 10))}/${sc(pct(allRates, 50))}/${sc(pct(allRates, 90))}/${sc(pct(allRates, 95))}`,
    );
  }
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
