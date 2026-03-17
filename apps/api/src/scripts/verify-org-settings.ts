/**
 * VERIFY ORG SETTINGS
 * 
 * Checks if organization settings are properly configured
 * Run this after completing the migration and Prisma generation
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Verifying Organization Settings...\n');

  try {
    // Check if the table exists by attempting a query
    const allSettings = await appPrisma.organizationSettings.findMany({
      select: {
        clerkOrgId: true,
        tracksDrivers: true,
      },
      orderBy: {
        clerkOrgId: 'asc',
      },
    });

    if (allSettings.length === 0) {
      console.log('⚠️  No organization settings found!');
      console.log('');
      console.log('Run the SQL migration first:');
      console.log('  apps/api/prisma/app/migrations/add_organization_settings.sql');
      console.log('');
      return;
    }

    console.log('✅ Organization Settings Found:\n');
    
    const orgNames: Record<string, string> = {
      'org_39B7lu1b8YKds8IOtzrk6LpKnLW': 'Wolverine',
      'org_39RQY3qNO861ScQb0ZLFSUIFZkN': 'Atlas',
    };

    allSettings.forEach((setting: any) => {
      const orgName = orgNames[setting.clerkOrgId] || 'Unknown Org';
      const driverStatus = setting.tracksDrivers ? '✅ TRACKS DRIVERS' : '❌ NO DRIVER TRACKING';
      
      console.log(`  ${orgName}:`);
      console.log(`    Clerk Org ID: ${setting.clerkOrgId}`);
      console.log(`    ${driverStatus}`);
      console.log('');
    });

    // Verify expected configuration
    const wolverine = allSettings.find((s: any) => s.clerkOrgId === 'org_39B7lu1b8YKds8IOtzrk6LpKnLW');
    const atlas = allSettings.find((s: any) => s.clerkOrgId === 'org_39RQY3qNO861ScQb0ZLFSUIFZkN');

    console.log('🔎 Configuration Check:');
    
    if (wolverine?.tracksDrivers === true) {
      console.log('  ✅ Wolverine: tracksDrivers = true (correct)');
    } else if (wolverine) {
      console.log('  ❌ Wolverine: tracksDrivers = false (SHOULD BE TRUE!)');
    } else {
      console.log('  ⚠️  Wolverine: Not configured');
    }

    if (atlas?.tracksDrivers === false) {
      console.log('  ✅ Atlas: tracksDrivers = false (correct)');
    } else if (atlas) {
      console.log('  ❌ Atlas: tracksDrivers = true (SHOULD BE FALSE!)');
    } else {
      console.log('  ⚠️  Atlas: Not configured');
    }

    console.log('');
    
    if (wolverine?.tracksDrivers === true && atlas?.tracksDrivers === false) {
      console.log('✅ All checks passed! Feature is properly configured.\n');
    } else {
      console.log('⚠️  Configuration issues detected. Review settings above.\n');
    }

  } catch (error: any) {
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      console.log('❌ Table `organization_settings` does not exist!\n');
      console.log('Run the SQL migration:');
      console.log('  apps/api/prisma/app/migrations/add_organization_settings.sql\n');
    } else if (error.message?.includes('Unknown')) {
      console.log('❌ Prisma client is out of date!\n');
      console.log('Regenerate the Prisma client:');
      console.log('  pnpm --filter @kerry-leasing/api prisma:generate\n');
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
