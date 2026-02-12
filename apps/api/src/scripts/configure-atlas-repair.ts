/**
 * CONFIGURE ATLAS REPAIR CUSTOMER
 * Sets up repair customer config for Atlas org
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔧 Configuring repair customer for Atlas org...\n');

  const klOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';
  const customerName = 'ATLAS WHOLESALE FOOD COMPANY';
  const contractStartDate = new Date('2026-02-01');

  try {
    // Check if already configured
    const existing = await appPrisma.repairCustomerConfig.findUnique({
      where: { klOrgId }
    });

    if (existing) {
      console.log(`✓ Found existing repair config for ${klOrgId}`);
      console.log(`  Customer: ${existing.customerName}`);
      console.log(`  Contract Start: ${existing.contractStartDate}`);
      
      // Update
      await appPrisma.repairCustomerConfig.update({
        where: { klOrgId },
        data: {
          customerName,
          contractStartDate
        }
      });
      console.log(`\n✓ Updated repair customer config`);
    } else {
      // Create new
      await appPrisma.repairCustomerConfig.create({
        data: {
          klOrgId,
          customerName,
          contractStartDate
        }
      });
      console.log(`\n✓ Created new repair customer config`);
    }

    // Verify
    const config = await appPrisma.repairCustomerConfig.findUnique({
      where: { klOrgId }
    });

    console.log('\n📋 Repair Configuration:');
    console.log(`  Org ID: ${config?.klOrgId}`);
    console.log(`  Customer: ${config?.customerName}`);
    console.log(`  Contract Start: ${config?.contractStartDate}`);
    console.log(`  Created: ${config?.createdAt}`);

    console.log('\n✅ Atlas repair customer configured!\n');

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
