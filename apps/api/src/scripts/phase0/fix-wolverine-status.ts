import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

async function main() {
  const r = await appPrisma.telematicsProviderAccount.update({
    where: { clerkOrgId: 'org_39B7lu1b8YKds8IOtzrk6LpKnLW' },
    data: { status: 'ACTIVE', lastError: null },
  });
  console.log('Fixed:', r.clerkOrgId, '→', r.status);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
