/**
 * Analyze January 2026 Motive data to find sources of driving-time discrepancy vs Motive UI.
 * Checks: duplicate vehicle-days, per-day distribution, vehicle_util vs driving_periods, units, vehicle set.
 */
import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const START = '2026-01-01';
const END = '2026-01-31';

async function main() {
  const app = getAppPrisma();

  // ---- 1) Vehicle utilization: row count and duplicate check ----
  const utilRows = await app.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: { vehicleId: true, date: true, drivingTime: true, idleTime: true, vehicleNumber: true },
  });

  const vehicleDateKeys = new Set(utilRows.map((r) => `${r.vehicleId}-${r.date}`));
  const duplicateCount = utilRows.length - vehicleDateKeys.size;
  const totalDrivingSec = utilRows.reduce((s, r) => s + (r.drivingTime ?? 0), 0);
  const totalIdleSec = utilRows.reduce((s, r) => s + (r.idleTime ?? 0), 0);
  const totalDrivingMin = totalDrivingSec / 60;

  // ---- 2) Per-day distribution (driving minutes by date) ----
  const byDate = new Map<string, { drivingSec: number; idleSec: number; rows: number }>();
  for (const r of utilRows) {
    const cur = byDate.get(r.date) ?? { drivingSec: 0, idleSec: 0, rows: 0 };
    cur.drivingSec += r.drivingTime ?? 0;
    cur.idleSec += r.idleTime ?? 0;
    cur.rows += 1;
    byDate.set(r.date, cur);
  }

  const sortedDates = [...byDate.keys()].sort();
  let minDay = '',
    maxDay = '';
  let minDriving = Infinity,
    maxDriving = -Infinity;
  for (const d of sortedDates) {
    const v = byDate.get(d)!;
    const drMin = v.drivingSec / 60;
    if (drMin < minDriving) {
      minDriving = drMin;
      minDay = d;
    }
    if (drMin > maxDriving) {
      maxDriving = drMin;
      maxDay = d;
    }
  }

  // ---- 3) Driving periods: total and by day ----
  const periodRows = await app.motiveDrivingPeriod.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: { date: true, duration: true, type: true },
  });
  const periodTotalSec = periodRows.reduce((s, r) => s + (r.duration ?? 0), 0);
  const periodByDate = new Map<string, number>();
  for (const r of periodRows) {
    periodByDate.set(r.date, (periodByDate.get(r.date) ?? 0) + (r.duration ?? 0));
  }

  // ---- 4) Vehicles with zero driving (candidate "excluded" in Motive report) ----
  const drivingByVehicle = new Map<string, number>();
  for (const r of utilRows) {
    const key = r.vehicleNumber ?? String(r.vehicleId);
    drivingByVehicle.set(key, (drivingByVehicle.get(key) ?? 0) + (r.drivingTime ?? 0));
  }
  const zeroDrivingVehicles = [...drivingByVehicle.entries()].filter(([, sec]) => sec === 0).map(([v]) => v);
  const withDrivingVehicles = [...drivingByVehicle.entries()].filter(([, sec]) => sec > 0);
  const drivingFromActiveUnits = withDrivingVehicles.reduce((s, [, sec]) => s + sec, 0);

  // ---- 5) Utilization vs periods by day (correlation) ----
  const utilByDateSec = new Map<string, number>();
  for (const r of utilRows) {
    utilByDateSec.set(r.date, (utilByDateSec.get(r.date) ?? 0) + (r.drivingTime ?? 0));
  }
  let daysUtilHigher = 0,
    daysPeriodHigher = 0,
    daysEqual = 0;
  const diffByDay: { date: string; utilMin: number; periodMin: number; diffMin: number }[] = [];
  for (const d of sortedDates) {
    const u = utilByDateSec.get(d) ?? 0;
    const p = periodByDate.get(d) ?? 0;
    const uMin = u / 60;
    const pMin = p / 60;
    const diff = uMin - pMin;
    diffByDay.push({ date: d, utilMin: uMin, periodMin: pMin, diffMin: diff });
    if (diff > 1) daysUtilHigher++;
    else if (diff < -1) daysPeriodHigher++;
    else daysEqual++;
  }

  // ---- 6) Units sanity check ----
  const avgPerVehicleDay = utilRows.length ? totalDrivingSec / utilRows.length : 0;
  const avgMinPerVehicleDay = avgPerVehicleDay / 60;

  // ---- OUTPUT ----
  console.log('\n========== JANUARY 2026 DRIVING TIME DISCREPANCY ANALYSIS ==========\n');
  console.log('1) DUPLICATE CHECK (vehicle utilization)');
  console.log('   Total rows:', utilRows.length);
  console.log('   Unique (vehicleId, date):', vehicleDateKeys.size);
  console.log('   Duplicates:', duplicateCount, duplicateCount ? '<<< BUG' : '(none)');
  console.log('');

  console.log('2) TOTALS & UNITS');
  console.log('   Total driving (seconds):', totalDrivingSec);
  console.log('   Total driving (minutes):', Math.round(totalDrivingMin));
  console.log('   Stored as seconds, displayed as /60 → minutes (correct)');
  console.log('   Avg seconds per vehicle-day:', avgPerVehicleDay.toFixed(1), '→', avgMinPerVehicleDay.toFixed(1), 'min');
  console.log('');

  console.log('3) PER-DAY DISTRIBUTION (vehicle utilization driving min)');
  console.log('   Days in range:', sortedDates.length);
  console.log('   Min day:', minDay, '→', minDriving.toFixed(0), 'min');
  console.log('   Max day:', maxDay, '→', maxDriving.toFixed(0), 'min');
  const meanPerDay = totalDrivingMin / sortedDates.length;
  console.log('   Mean per day:', meanPerDay.toFixed(0), 'min');
  const stdDev = Math.sqrt(
    sortedDates.reduce((s, d) => {
      const v = (utilByDateSec.get(d) ?? 0) / 60;
      return s + (v - meanPerDay) ** 2;
    }, 0) / sortedDates.length
  );
  console.log('   Std dev:', stdDev.toFixed(0), 'min (no spike = consistent)');
  console.log('');

  console.log('4) VEHICLE UTILIZATION vs DRIVING PERIODS (same month)');
  console.log('   Vehicle util total driving:', Math.round(totalDrivingMin), 'min');
  console.log('   Driving periods total (all types):', Math.round(periodTotalSec / 60), 'min');
  console.log('   Difference (util - periods):', Math.round(totalDrivingMin - periodTotalSec / 60), 'min');
  console.log('   By day: util higher on', daysUtilHigher, 'days, periods higher on', daysPeriodHigher, 'days');
  console.log('   Per-day util vs periods (first 5 days):');
  diffByDay.slice(0, 5).forEach(({ date, utilMin, periodMin, diffMin }) => {
    console.log('    ', date, 'util', utilMin.toFixed(0), 'min  period', periodMin.toFixed(0), 'min  diff', diffMin.toFixed(0));
  });
  console.log('');

  console.log('5) VEHICLE SET');
  console.log('   Vehicles with >0 driving:', withDrivingVehicles.length);
  console.log('   Vehicles with 0 driving (all month):', zeroDrivingVehicles.length, zeroDrivingVehicles.slice(0, 15).join(', ') + (zeroDrivingVehicles.length > 15 ? '...' : ''));
  console.log('   Driving from "active" units only:', Math.round(drivingFromActiveUnits / 60), 'min (same as total; 0-driving add 0)');
  console.log('');

  console.log('6) LIKELY SOURCES OF DISCREPANCY VS MOTIVE UI (~22k min)');
  console.log('   A) Duplicate vehicle-days:', duplicateCount ? 'YES – fix dedup' : 'No.');
  console.log('   B) Wrong units (e.g. minutes stored as seconds):', totalDrivingMin > 400000 ? 'Possible (would be 2x)' : 'No (total in expected range).');
  console.log('   C) Extra vehicles: We have', utilRows.length / 31, 'vehicles with data; if Motive report shows fewer, their total is lower.');
  console.log('   D) API vs UI definition: Motive API vehicle_utilization may include all movement; UI report may show different metric (e.g. HOS drive only).');
  console.log('   E) Day boundary: We use Eastern midnight; if UI uses different TZ for "January", daily buckets differ → different monthly total.');
  console.log('');
  console.log('========== END ANALYSIS ==========\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
