/**
 * Inspect raw safety events from the Samsara legacy /fleet/safety-events endpoint
 * for a given org + date. Dumps behaviorLabel values + severity so we can verify
 * the behaviorLabelMap covers them.
 */
import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { SamsaraClient } from '../telematics/samsara/client.js';
import { getESTDayBounds } from '../telematics/dates.js';
import { mapSamsaraBehavior } from '../telematics/samsara/behaviorLabelMap.js';

const orgId = process.argv[2] || 'org_3EJvdgtV2yNSGCLDia2LhQq7rFe';
const date = process.argv[3] || new Date(Date.now() - 86400000).toISOString().split('T')[0]!;

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findUnique({ where: { clerkOrgId: orgId } });
  if (!account) { console.error('No account'); process.exit(1); }
  const client = new SamsaraClient(readCredentials(account.credentialsJson).apiToken as string);
  const { startTime, endTime } = getESTDayBounds(date);

  console.log(`Fetching safety events for ${orgId} on ${date}\n`);
  const events: any[] = await client.get('/fleet/safety-events', { startTime, endTime, limit: 100 });
  console.log(`Returned ${events.length} events\n`);

  const labelCounts = new Map<string, { total: number; mapped: number; severities: Set<string> }>();
  for (const e of events) {
    const behaviors = Array.isArray(e.behaviors) ? e.behaviors : [];
    for (const b of behaviors) {
      const key = b.behaviorLabel ?? '(none)';
      const cur = labelCounts.get(key) ?? { total: 0, mapped: 0, severities: new Set<string>() };
      cur.total++;
      if (b.severity) cur.severities.add(b.severity);
      const mapped = mapSamsaraBehavior(key, b.severity);
      if (mapped) cur.mapped++;
      labelCounts.set(key, cur);
    }
  }

  console.log('behaviorLabel coverage:');
  for (const [label, c] of [...labelCounts.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const sev = c.severities.size > 0 ? `, severities=[${[...c.severities].join(',')}]` : '';
    console.log(`  ${label.padEnd(28)} total=${c.total}, mapped=${c.mapped}${sev}`);
  }

  // Print one full event sample so we know the response shape
  if (events.length > 0) {
    console.log(`\nSample event keys:    ${Object.keys(events[0]).join(', ')}`);
    console.log(`\nFull sample event:`);
    console.log(JSON.stringify(events[0], null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => appPrisma.$disconnect());
