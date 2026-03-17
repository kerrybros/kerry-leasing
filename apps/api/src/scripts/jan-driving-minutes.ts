/**
 * One-off: sum driving time (minutes) for January 2026 for Wolverine.
 */
import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

async function main() {
  const app = getAppPrisma();
  const rows = await app.motiveVehicleUtilization.findMany({
    where: {
      clerkOrgId: ORG,
      date: { gte: '2026-01-01', lte: '2026-01-31' },
    },
    select: { drivingTime: true },
  });
  const totalSeconds = rows.reduce((s, r) => s + (r.drivingTime ?? 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  console.log('\nJanuary 2026 – Wolverine driving time');
  console.log('  Total seconds:', totalSeconds);
  console.log('  Total minutes:', totalMinutes);
  console.log('  Vehicle-days:', rows.length);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
