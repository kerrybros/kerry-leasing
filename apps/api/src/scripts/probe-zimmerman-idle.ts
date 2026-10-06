/**
 * READ-ONLY probe: re-fetch Motive driver utilization for Rob Zimmerman, Aug 3-9 2026,
 * and compare live API values against what we have stored.
 * Does not write to the database.
 */
import { PrismaClient } from '../generated/app-client/index.js';
import { readCredentials } from '../lib/credentials.js';
import { MotiveClient } from '../telematics/motive/client.js';
import { fetchDriverUtilization } from '../telematics/motive/endpoints/driverUtilization.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const DRIVER_ID = 5494534;
const DATES = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];

// Jacob's Aug 17 pull, for reference
const JACOB: Record<string, { drive: number; idle: number; fuel: number }> = {
  '2026-08-03': { drive: 4.6, idle: 0.3, fuel: 0.26 },
  '2026-08-04': { drive: 2.1, idle: 2.2, fuel: 1.79 },
  '2026-08-05': { drive: 1.4, idle: 3.5, fuel: 2.62 },
  '2026-08-06': { drive: 1.9, idle: 2.4, fuel: 1.9 },
  '2026-08-07': { drive: 3.3, idle: 3.2, fuel: 2.27 },
  '2026-08-09': { drive: 2.2, idle: 1.6, fuel: 0.95 },
};

const hr = (sec: number | null | undefined) => (sec == null ? null : +(sec / 3600).toFixed(2));

async function main() {
  const prisma = new PrismaClient();
  const account = await prisma.telematicsProviderAccount.findUnique({ where: { clerkOrgId: ORG } });
  if (!account) throw new Error('no provider account');
  const apiKey = readCredentials(account.credentialsJson).apiKey as string;
  const client = new MotiveClient(apiKey);

  const stored = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId: ORG, driverId: DRIVER_ID, date: { in: DATES } },
  });
  const storedBy = new Map(stored.map((r) => [r.date, r]));

  const totals = { liveDrive: 0, liveIdle: 0, liveFuel: 0, dbDrive: 0, dbIdle: 0, dbFuel: 0 };

  console.log('date        | live drive | live idle | live gal | db drive | db idle | db gal | jacob drive | jacob idle | jacob gal');
  for (const date of DATES) {
    const rows = await fetchDriverUtilization(client, date, [DRIVER_ID]);
    const live = rows.find((r: any) => r?.driver?.id === DRIVER_ID) as any;
    const db = storedBy.get(date);
    const j = JACOB[date];

    if (live) {
      totals.liveDrive += live.driving_time ?? 0;
      totals.liveIdle += live.idle_time ?? 0;
      totals.liveFuel += live.idle_fuel ?? 0;
    }
    if (db) {
      totals.dbDrive += db.drivingTime ?? 0;
      totals.dbIdle += db.idleTime ?? 0;
      totals.dbFuel += db.idleFuel ?? 0;
    }

    console.log(
      [
        date,
        hr(live?.driving_time),
        hr(live?.idle_time),
        live?.idle_fuel?.toFixed(2) ?? null,
        hr(db?.drivingTime),
        hr(db?.idleTime),
        db?.idleFuel?.toFixed(2) ?? null,
        j?.drive ?? null,
        j?.idle ?? null,
        j?.fuel ?? null,
      ].join(' | ')
    );
  }

  const pct = (idle: number, drive: number) => ((idle / (idle + drive)) * 100).toFixed(2) + '%';
  console.log('\n--- WEEK TOTALS (Aug 3-9) ---');
  console.log(`LIVE Motive today : drive ${hr(totals.liveDrive)} hr, idle ${hr(totals.liveIdle)} hr, fuel ${totals.liveFuel.toFixed(2)} gal, idle% ${pct(totals.liveIdle, totals.liveDrive)}`);
  console.log(`OUR stored data   : drive ${hr(totals.dbDrive)} hr, idle ${hr(totals.dbIdle)} hr, fuel ${totals.dbFuel.toFixed(2)} gal, idle% ${pct(totals.dbIdle, totals.dbDrive)}`);
  console.log(`JACOB Aug 17 pull : drive 15.4 hr, idle 13.2 hr, fuel 9.79 gal, idle% 46.16%`);
  console.log(`SCORECARD sent    : idle% 62.9%, idle fuel 11.1 gal`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
