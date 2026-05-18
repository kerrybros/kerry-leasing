/* Consistency: getDriverSafetyByPeriod(period) must equal the headline
 * scorecard's per-driver safety sub-score for that same window. Read-only. */
import { TelematicsService } from '../services/telematicsService.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

async function main() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400_000);
  const startDate = ymd(start), endDate = ymd(end);
  const svc = new TelematicsService();

  const card = await svc.getDriverScorecard(ORG, startDate, endDate);
  const byPeriod = await svc.getDriverSafetyByPeriod(ORG, [{ key: 'P', startDate, endDate }]);
  const safetyMap = byPeriod['P'] ?? {};

  let checked = 0, mismatches = 0;
  for (const d of card.data) {
    const fromCard = d.subScores.safety;
    // headline includes every driver (safety 100 when no events); by-period only
    // emits drivers with data in-window — treat missing as 100 to compare like-for-like.
    const fromPeriod = safetyMap[d.driverId] ?? 100;
    checked++;
    if (fromCard !== fromPeriod) {
      mismatches++;
      if (mismatches <= 8) console.log(`  MISMATCH driver ${d.driverId}: card=${fromCard} period=${fromPeriod} (events=${d.hardEvents})`);
    }
  }
  console.log(`\nchecked ${checked} drivers · mismatches ${mismatches} → ${mismatches === 0 ? 'CONSISTENT ✓' : 'INCONSISTENT ✗'}`);

  // Also exercise a multi-bucket call (a few months) to confirm bucketing runs.
  const months = ['2026-02', '2026-03', '2026-04'].map(mk => {
    const [y, m] = mk.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { key: mk, startDate: `${mk}-01`, endDate: `${mk}-${String(last).padStart(2, '0')}` };
  });
  const mb = await svc.getDriverSafetyByPeriod(ORG, months);
  for (const mk of Object.keys(mb)) {
    const vals = Object.values(mb[mk]);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    console.log(`  ${mk}: ${vals.length} drivers, avg safety ${avg}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
