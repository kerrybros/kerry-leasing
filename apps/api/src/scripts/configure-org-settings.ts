/**
 * CONFIGURE ORG SETTINGS
 * Sets up organization-level feature flags
 * 
 * After running this:
 * 1. Stop the API server
 * 2. Run: pnpm --filter @kerry-leasing/api prisma:generate
 * 3. Restart the API server
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔧 Configuring organization settings...\n');

  // Note: This will fail until you restart the API server and regenerate Prisma client
  // For now, run the SQL migration manually

  console.log('⚠️  MANUAL SETUP REQUIRED:');
  console.log('');
  console.log('1. Stop the API server (if running)');
  console.log('2. Run the migration:');
  console.log('   - Execute: apps/api/prisma/app/migrations/add_organization_settings.sql');
  console.log('   - Against: APP_DATABASE_URL');
  console.log('3. Generate Prisma client:');
  console.log('   - Run: pnpm --filter @kerry-leasing/api prisma:generate');
  console.log('4. Restart API server');
  console.log('');
  console.log('Then this script will work to manage settings via code.');
  console.log('');

  try {
    // Wolverine: tracks drivers (Motive with HOS/ELD)
    const wolverineSettings = await appPrisma.organizationSettings.upsert({
      where: { clerkOrgId: 'org_39B7lu1b8YKds8IOtzrk6LpKnLW' },
      create: {
        clerkOrgId: 'org_39B7lu1b8YKds8IOtzrk6LpKnLW',
        tracksDrivers: true,
      },
      update: {
        tracksDrivers: true,
      },
    });

    console.log('✅ Wolverine: tracksDrivers = true');

    // Atlas: does NOT track drivers (Samsara without driver assignment)
    const atlasSettings = await appPrisma.organizationSettings.upsert({
      where: { clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN' },
      create: {
        clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
        tracksDrivers: false,
      },
      update: {
        tracksDrivers: false,
      },
    });

    console.log('✅ Atlas: tracksDrivers = false');
    console.log('');
    console.log('✅ Organization settings configured!\n');
  } catch (error: any) {
    if (error.message?.includes('Unknown')) {
      console.log('⚠️  Run the migration first, then try this script again.');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
