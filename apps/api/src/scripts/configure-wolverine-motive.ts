/**
 * CONFIGURE WOLVERINE MOTIVE
 * Sets up the telematicsProviderAccount for Wolverine
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔧 Configuring Wolverine Motive Integration...\n');

  const wolverineOrgId = 'org_2ZBQsLlFpgzE9CvpkGR4SYWdRJi';
  const motiveApiKey = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

  // Check if already exists
  const existing = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: wolverineOrgId },
  });

  if (existing) {
    console.log(`✓ Provider account already exists`);
    console.log(`  Provider: ${existing.provider}`);
    console.log(`  Status: ${existing.status}`);
    console.log(`  Last sync: ${existing.lastSyncAt || 'Never'}\n`);

    // Update to ensure it's active
    await appPrisma.telematicsProviderAccount.update({
      where: { clerkOrgId: wolverineOrgId },
      data: {
        provider: 'MOTIVE',
        credentialsJson: { apiKey: motiveApiKey },
        status: 'ACTIVE',
        lastError: null,
      },
    });
    console.log('✅ Updated to ACTIVE\n');
  } else {
    console.log('Creating new provider account...');
    await appPrisma.telematicsProviderAccount.create({
      data: {
        clerkOrgId: wolverineOrgId,
        provider: 'MOTIVE',
        credentialsJson: { apiKey: motiveApiKey },
        status: 'ACTIVE',
      },
    });
    console.log('✅ Created successfully\n');
  }

  // Display final config
  const config = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: wolverineOrgId },
  });

  console.log('📋 WOLVERINE CONFIGURATION:');
  console.log(`  Org ID: ${config!.clerkOrgId}`);
  console.log(`  Provider: ${config!.provider}`);
  console.log(`  Status: ${config!.status}`);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
