/**
 * Compare driving time from vehicle utilization vs driving periods (by type).
 * Use this to explain gaps vs Motive UI: vehicle_utilization often includes
 * all movement (driving + PC + YM); Motive UI reports may show only "drive time" (HOS).
 */
import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const START = '2026-01-01';
const END = '2026-01-31';

async function main() {
  const app = getAppPrisma();

  // 1) Vehicle utilization total (what we show in fleet / jan-driving-minutes)
  const utilRows = await app.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: { drivingTime: true, vehicleId: true, date: true },
  });
  const utilTotalSeconds = utilRows.reduce((s, r) => s + (r.drivingTime ?? 0), 0);
  const utilTotalMinutes = Math.round(utilTotalSeconds / 60);

  // 2) Driving periods by type (driving = on-duty; PC = personal conveyance; YM = yard move)
  const periodRows = await app.motiveDrivingPeriod.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: { duration: true, type: true },
  });
  const byType: Record<string, { seconds: number; count: number }> = {};
  for (const r of periodRows) {
    const key = r.type ?? 'null';
    if (!byType[key]) byType[key] = { seconds: 0, count: 0 };
    byType[key].seconds += r.duration ?? 0;
    byType[key].count += 1;
  }
  const periodTotalSeconds = periodRows.reduce((s, r) => s + (r.duration ?? 0), 0);
  const periodTotalMinutes = Math.round(periodTotalSeconds / 60);
  const drivingOnlySeconds = byType['driving']?.seconds ?? 0;
  const drivingOnlyMinutes = Math.round(drivingOnlySeconds / 60);
  const pcSeconds = byType['PC']?.seconds ?? 0;
  const ymSeconds = byType['YM']?.seconds ?? 0;
  const otherSeconds = periodTotalSeconds - drivingOnlySeconds - pcSeconds - ymSeconds;

  console.log('\n--- January 2026 – Wolverine driving time comparison ---\n');
  console.log('Vehicle utilization (source for fleet report):');
  console.log('  Total driving time:', utilTotalMinutes, 'minutes');
  console.log('  Vehicle-days:', utilRows.length);
  console.log('');
  console.log('Driving periods (by trip type):');
  console.log('  type=driving (on-duty):', drivingOnlyMinutes, 'minutes');
  console.log('  type=PC (personal conveyance):', Math.round(pcSeconds / 60), 'minutes');
  console.log('  type=YM (yard move):', Math.round(ymSeconds / 60), 'minutes');
  console.log('  type=null/other:', Math.round(otherSeconds / 60), 'minutes');
  console.log('  Total (all types):', periodTotalMinutes, 'minutes');
  console.log('');
  console.log('Difference: vehicle_util total - driving_periods(driving only) =', utilTotalMinutes - drivingOnlyMinutes, 'minutes');
  console.log('  (If Motive UI shows only "drive time" / HOS, it may be close to driving_only above.)');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
