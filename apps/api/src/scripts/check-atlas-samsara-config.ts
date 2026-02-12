/**
 * CHECK ATLAS SAMSARA CONFIGURATION
 * Verifies if Atlas has Samsara credentials configured
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Checking Atlas Samsara Configuration...\n');

  const atlasOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

  try {
    const account = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId: atlasOrgId },
      select: {
        id: true,
        clerkOrgId: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        credentialsJson: true,
      },
    });

    if (!account) {
      console.log('❌ No telematics provider account found for Atlas!\n');
      console.log('Need to configure Samsara credentials for Atlas org.\n');
      return;
    }

    console.log('✅ Telematics Provider Account Found:\n');
    console.log(`  Org ID: ${account.clerkOrgId}`);
    console.log(`  Provider: ${account.provider}`);
    console.log(`  Status: ${account.status}`);
    console.log(`  Last Sync: ${account.lastSyncAt || 'Never'}`);
    console.log(`  Last Error: ${account.lastError || 'None'}`);
    console.log(`  Has API Token: ${account.credentialsJson ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (account.provider !== 'SAMSARA') {
      console.log('⚠️  Warning: Provider is not SAMSARA!');
      console.log(`   Current: ${account.provider}`);
      console.log('');
    }

    // Check for existing data
    const rawDataCount = await appPrisma.samsaraRawData.count({
      where: { clerkOrgId: atlasOrgId },
    });

    console.log('📊 Existing Data:');
    console.log(`  Raw Samsara Records: ${rawDataCount}`);
    console.log('');

    if (rawDataCount === 0) {
      console.log('💡 No data yet - ready for initial backfill from Feb 1, 2026');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
