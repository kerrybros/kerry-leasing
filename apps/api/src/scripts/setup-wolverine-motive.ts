/**
 * SETUP SCRIPT: Configure Wolverine's Motive Integration
 * 
 * This script inserts or updates the Motive provider account for Wolverine
 * Run this ONCE to configure the integration
 * 
 * Usage:
 *   npx tsx src/scripts/setup-wolverine-motive.ts
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient: AppPrismaClient } = require('../generated/app-client/index.js');

async function setupWolverineMotive() {
  console.log(`\n🔧 SETTING UP WOLVERINE MOTIVE INTEGRATION\n`);

  const clerkOrgId = 'org_wolverine'; // Replace with actual Clerk org ID when known
  const motiveApiKey = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

  const appPrisma = new AppPrismaClient({
    datasources: {
      db: {
        url: process.env.APP_DATABASE_URL,
      },
    },
  });

  try {
    // Check if already exists
    const existing = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    if (existing) {
      console.log(`✓ Provider account already exists for ${clerkOrgId}`);
      console.log(`  Current provider: ${existing.provider}`);
      console.log(`  Status: ${existing.status}`);
      console.log(`  Last sync: ${existing.lastSyncAt || 'Never'}\n`);

      // Update if needed
      console.log(`Updating API key...`);
      await appPrisma.telematicsProviderAccount.update({
        where: { clerkOrgId },
        data: {
          provider: 'MOTIVE',
          credentialsJson: { apiKey: motiveApiKey },
          status: 'ACTIVE',
          lastError: null
        }
      });
      console.log(`✓ Updated successfully\n`);
    } else {
      console.log(`Creating new provider account for ${clerkOrgId}...`);
      await appPrisma.telematicsProviderAccount.create({
        data: {
          clerkOrgId,
          provider: 'MOTIVE',
          credentialsJson: { apiKey: motiveApiKey },
          status: 'ACTIVE'
        }
      });
      console.log(`✓ Created successfully\n`);
    }

    // Display configuration
    const config = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    console.log(`📋 CONFIGURATION:`);
    console.log(`  Org ID: ${config.clerkOrgId}`);
    console.log(`  Provider: ${config.provider}`);
    console.log(`  API Key: ${(config.credentialsJson as any).apiKey.substring(0, 10)}...`);
    console.log(`  Status: ${config.status}`);
    console.log(`\n✅ Setup complete!`);
    console.log(`\n📝 Next steps:`);
    console.log(`  1. Run test: npx tsx src/scripts/test-yesterday.ts`);
    console.log(`  2. Or backdate: pnpm backdate -- --org=${clerkOrgId} --start=2025-05-01 --end=2026-02-02\n`);
  } catch (error: any) {
    console.error(`\n❌ Setup failed:`, error.message);
    process.exit(1);
  } finally {
    await appPrisma.$disconnect();
  }
}

setupWolverineMotive();
