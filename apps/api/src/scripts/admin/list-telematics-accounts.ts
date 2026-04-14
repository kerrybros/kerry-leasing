import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
const accounts = await appPrisma.telematicsProviderAccount.findMany({
  select: { clerkOrgId: true, provider: true, status: true, lastSyncAt: true, lastError: true }
});
for (const a of accounts) console.log(JSON.stringify(a));
await appPrisma.$disconnect();
