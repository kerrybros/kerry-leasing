/**
 * Org inventory + API key health check.
 * Lists all telematicsProviderAccount rows, decrypts credentials,
 * and tests each API key with a lightweight call.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/confirm-org-ids.ts
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';
import { MotiveClient } from '../../telematics/motive/client.js';

async function testSamsara(apiToken: string): Promise<boolean> {
  try {
    const client = new SamsaraClient(apiToken);
    return await client.testConnection();
  } catch {
    return false;
  }
}

async function testMotive(apiKey: string): Promise<boolean> {
  try {
    const client = new MotiveClient(apiKey);
    await client.get('/v1/vehicles', { per_page: 1, page: 1 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    select: {
      id: true,
      clerkOrgId: true,
      provider: true,
      status: true,
      credentialsJson: true,
    },
    orderBy: { provider: 'asc' },
  });

  if (accounts.length === 0) {
    console.log('No telematicsProviderAccount rows found.');
    return;
  }

  console.log('\n--- Org Inventory ---\n');
  console.log(
    ['OrgId', 'Provider', 'DB Status', 'API Key Present', 'API Test'].join('\t')
  );
  console.log('-'.repeat(90));

  for (const account of accounts) {
    let keyPresent = false;
    let apiWorks = false;

    try {
      const creds = readCredentials(account.credentialsJson);
      if (account.provider === 'SAMSARA') {
        const token = creds.apiToken as string | undefined;
        keyPresent = !!token;
        if (token) apiWorks = await testSamsara(token);
      } else if (account.provider === 'MOTIVE') {
        const key = creds.apiKey as string | undefined;
        keyPresent = !!key;
        if (key) apiWorks = await testMotive(key);
      }
    } catch (e: any) {
      console.log(
        [account.clerkOrgId, account.provider, account.status, 'DECRYPT_FAIL', 'N/A'].join('\t')
      );
      continue;
    }

    console.log(
      [
        account.clerkOrgId,
        account.provider,
        account.status,
        keyPresent ? 'yes' : 'no',
        apiWorks ? 'PASS' : 'FAIL',
      ].join('\t')
    );
  }

  console.log('\n--- Done ---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
