/**
 * CONFIGURE ATLAS WITH SAMSARA
 * One-time script to set up Samsara provider for Atlas org
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔧 Configuring Samsara for Atlas org...\n');

  const clerkOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';
  const apiToken = process.env.SAMSARA_API_TOKEN;
  if (!apiToken) {
    console.error('Set SAMSARA_API_TOKEN in env and run again.');
    process.exit(1);
  }

  try {
    // Check if already configured
    const existing = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    if (existing) {
      console.log(`✓ Found existing configuration for ${clerkOrgId}`);
      console.log(`  Provider: ${existing.provider}`);
      console.log(`  Status: ${existing.status}`);
      
      // Update to Samsara
      await appPrisma.telematicsProviderAccount.update({
        where: { clerkOrgId },
        data: {
          provider: 'SAMSARA',
          credentialsJson: { apiToken },
          status: 'ACTIVE',
          lastError: null
        }
      });
      console.log(`\n✓ Updated to SAMSARA provider`);
    } else {
      // Create new
      await appPrisma.telematicsProviderAccount.create({
        data: {
          clerkOrgId,
          provider: 'SAMSARA',
          credentialsJson: { apiToken },
          status: 'ACTIVE'
        }
      });
      console.log(`\n✓ Created new SAMSARA provider configuration`);
    }

    // Verify
    const config = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    console.log('\n📋 Configuration:');
    console.log(`  Org ID: ${config?.clerkOrgId}`);
    console.log(`  Provider: ${config?.provider}`);
    console.log(`  Status: ${config?.status}`);
    console.log(`  Created: ${config?.createdAt}`);

    console.log('\n✅ Atlas org configured with Samsara!');
    console.log('\nNext step: Run backdate script');
    console.log('  pnpm backdate-samsara -- --org=org_39RQY3qNO861ScQb0ZLFSUIFZkN --start=2026-02-01 --end=2026-02-09\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
