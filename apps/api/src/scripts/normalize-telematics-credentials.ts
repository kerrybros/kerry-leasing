/**
 * One-time migration helper to normalize telematics credentials to encrypted format.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/normalize-telematics-credentials.ts --dry-run
 *   pnpm exec tsx src/scripts/normalize-telematics-credentials.ts --apply
 *   pnpm exec tsx src/scripts/normalize-telematics-credentials.ts --apply --provider=MOTIVE
 *   pnpm exec tsx src/scripts/normalize-telematics-credentials.ts --apply --org=org_xxxxx
 */
import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';
import {
  assertCredentialsEncryptionKeyConfigured,
  encryptCredentials,
  isEncrypted,
} from '../lib/credentials.js';

type Provider = 'MOTIVE' | 'SAMSARA';

interface Options {
  dryRun: boolean;
  org?: string;
  provider?: Provider;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = { dryRun: true };

  for (const arg of args) {
    if (arg === '--apply') options.dryRun = false;
    if (arg === '--dry-run') options.dryRun = true;
    if (arg.startsWith('--org=')) options.org = arg.split('=')[1];
    if (arg.startsWith('--provider=')) {
      const provider = arg.split('=')[1]?.toUpperCase();
      if (provider !== 'MOTIVE' && provider !== 'SAMSARA') {
        throw new Error('Invalid --provider value. Use MOTIVE or SAMSARA.');
      }
      options.provider = provider;
    }
  }

  return options;
}

function toCredentialsObject(credentialsJson: unknown): Record<string, unknown> | null {
  if (credentialsJson && typeof credentialsJson === 'object') {
    return credentialsJson as Record<string, unknown>;
  }

  // Handle legacy rows where JSON object was serialized to string
  if (typeof credentialsJson === 'string' && !isEncrypted(credentialsJson)) {
    try {
      const parsed = JSON.parse(credentialsJson);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function main() {
  const options = parseArgs();
  assertCredentialsEncryptionKeyConfigured();

  const app = getAppPrisma();
  const accounts = await app.telematicsProviderAccount.findMany({
    where: {
      ...(options.org ? { clerkOrgId: options.org } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
    },
    select: {
      clerkOrgId: true,
      provider: true,
      credentialsJson: true,
    },
  });

  let encryptedAlready = 0;
  let migratedPlaintext = 0;
  let failed = 0;

  console.log(
    `[TelematicsCredentialsNormalize] mode=${options.dryRun ? 'dry-run' : 'apply'} accounts=${accounts.length}`
  );

  for (const account of accounts) {
    const { clerkOrgId, provider, credentialsJson } = account;

    if (isEncrypted(credentialsJson)) {
      encryptedAlready++;
      continue;
    }

    const plaintext = toCredentialsObject(credentialsJson);
    if (!plaintext) {
      failed++;
      console.error(
        JSON.stringify({
          event: 'telematics_credentials_unrecognized_format',
          clerkOrgId,
          provider,
        })
      );
      continue;
    }

    // Structured log for migration-window visibility of plaintext rows.
    console.warn(
      JSON.stringify({
        event: 'telematics_credentials_plaintext_detected',
        clerkOrgId,
        provider,
      })
    );

    if (options.dryRun) {
      migratedPlaintext++;
      continue;
    }

    try {
      const encrypted = encryptCredentials(plaintext);
      await app.telematicsProviderAccount.update({
        where: { clerkOrgId },
        data: { credentialsJson: encrypted as never },
      });
      migratedPlaintext++;
    } catch (error: any) {
      failed++;
      console.error(
        JSON.stringify({
          event: 'telematics_credentials_migration_failed',
          clerkOrgId,
          provider,
          error: error?.message ?? 'unknown',
        })
      );
    }
  }

  console.log('\n[TelematicsCredentialsNormalize] Summary');
  console.log(`  encrypted_already: ${encryptedAlready}`);
  console.log(`  migrated_plaintext: ${migratedPlaintext}`);
  console.log(`  failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
