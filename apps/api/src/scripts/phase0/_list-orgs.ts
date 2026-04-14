import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

const accounts = await appPrisma.telematicsProviderAccount.findMany({
  select: { clerkOrgId: true, provider: true, status: true },
});
console.log(JSON.stringify(accounts, null, 2));
await appPrisma.$disconnect();
