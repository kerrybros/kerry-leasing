import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

const accounts = await appPrisma.telematicsProviderAccount.findMany({
  select: { clerkOrgId: true, provider: true, status: true, credentialsJson: true },
});
for (const a of accounts) {
  const keys = Object.keys(a.credentialsJson as object);
  console.log(`${a.clerkOrgId} | ${a.provider} | ${a.status} | keys: ${keys.join(', ')}`);
}
await appPrisma.$disconnect();
