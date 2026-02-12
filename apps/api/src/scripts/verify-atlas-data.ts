/**
 * VERIFY ATLAS COMPLETE SETUP
 * 
 * Verifies both Samsara telematics and repair data integration for Atlas
 * Run this script to check that Atlas org is fully configured and data is flowing
 */

import { appPrisma, repairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';

const ATLAS_ORG_ID = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

async function main() {
  console.log('\n🔍 Verifying Atlas Complete Setup\n');
  console.log('═'.repeat(60));
  console.log('');

  let allGood = true;

  try {
    // 1. Telematics Provider Account
    console.log('1️⃣  TELEMATICS PROVIDER (Samsara)');
    const telematicsAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId: ATLAS_ORG_ID }
    });

    if (!telematicsAccount) {
      console.log('   ❌ No telematics provider configured');
      allGood = false;
    } else {
      console.log(`   ✅ Provider: ${telematicsAccount.provider}`);
      console.log(`   ✅ Status: ${telematicsAccount.status}`);
      console.log(`   ✅ Last Sync: ${telematicsAccount.lastSyncedAt ? telematicsAccount.lastSyncedAt.toISOString() : 'Never'}`);
      
      // Check for recent Samsara data
      const recentData = await appPrisma.samsaraRawData.findFirst({
        where: { clerkOrgId: ATLAS_ORG_ID },
        orderBy: { date: 'desc' }
      });

      if (recentData) {
        console.log(`   ✅ Latest data: ${recentData.date}`);
      } else {
        console.log('   ⚠️  No Samsara raw data found yet');
      }
    }
    console.log('');

    // 2. Repair Customer Config
    console.log('2️⃣  REPAIR CUSTOMER CONFIG');
    const repairConfig = await appPrisma.repairCustomerConfig.findUnique({
      where: { klOrgId: ATLAS_ORG_ID }
    });

    if (!repairConfig) {
      console.log('   ❌ No repair customer configured');
      allGood = false;
    } else {
      console.log(`   ✅ Customer: ${repairConfig.customerName}`);
      console.log(`   ✅ Contract Start: ${repairConfig.contractStartDate.toISOString().split('T')[0]}`);
    }
    console.log('');

    // 3. Service Plan Units
    console.log('3️⃣  SERVICE PLAN UNITS');
    const servicePlanUnits = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId: ATLAS_ORG_ID,
        isIncluded: true
      }
    });

    console.log(`   ✅ Total included units: ${servicePlanUnits.length}`);
    
    if (servicePlanUnits.length === 0) {
      console.log('   ⚠️  No service plan units configured');
      allGood = false;
    } else {
      const withVin = servicePlanUnits.filter(u => u.repairVin).length;
      console.log(`   ✅ Units with VIN: ${withVin}/${servicePlanUnits.length}`);
    }
    console.log('');

    // 4. Repair Data (Last 30 Days)
    if (repairConfig) {
      console.log('4️⃣  REPAIR DATA (Last 30 Days)');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const unitNumbers = servicePlanUnits
        .map(u => u.repairUnitNumber)
        .filter((n): n is string => !!n);

      const recentRepairs = await repairPrisma.revenue_details.findMany({
        where: {
          organization_id: REPAIR_SHOP_ORG_ID,
          customer: {
            equals: repairConfig.customerName,
            mode: 'insensitive'
          },
          unit: {
            in: unitNumbers
          },
          invoice_date: {
            not: null,
            gte: thirtyDaysAgo
          }
        },
        select: {
          number: true,
          invoice_date: true,
          total: true
        }
      });

      // Count unique invoices
      const uniqueInvoices = new Set(recentRepairs.map(r => r.number)).size;
      const totalRevenue = recentRepairs.reduce((sum, r) => sum + Number(r.total || 0), 0);

      console.log(`   ✅ Invoices (last 30 days): ${uniqueInvoices}`);
      console.log(`   ✅ Total revenue: $${totalRevenue.toFixed(2)}`);
      console.log(`   ✅ Line items: ${recentRepairs.length}`);
      
      if (recentRepairs.length === 0) {
        console.log('   ℹ️  No recent repair data (this may be normal)');
      }
    }
    console.log('');

    // 5. Summary
    console.log('═'.repeat(60));
    console.log('');
    if (allGood) {
      console.log('✅ ATLAS SETUP COMPLETE');
      console.log('');
      console.log('All systems configured and operational:');
      console.log('  • Samsara telematics integration');
      console.log('  • Repair customer mapping');
      console.log('  • Service plan units');
      console.log('  • Historical repair data access');
      console.log('');
      console.log('🌐 Ready to use in the application!');
    } else {
      console.log('⚠️  SETUP INCOMPLETE');
      console.log('');
      console.log('Some components are missing. Review the output above.');
      console.log('');
      console.log('To fix:');
      console.log('  1. Run: pnpm --filter @kerry-leasing/api exec tsx src/scripts/configure-atlas-samsara.ts');
      console.log('  2. Run: pnpm --filter @kerry-leasing/api exec tsx src/scripts/configure-atlas-repair.ts');
      console.log('  3. Backfill Samsara data if needed');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
