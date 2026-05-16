/**
 * INSPECT WHIPAROUND DRIVERS — one-off verification script.
 *
 * Purpose: before we wire phone-sync from Whiparound, confirm whether the
 * customer's Whiparound account has phone numbers populated for their
 * drivers. The public docs list a `GET /drivers` endpoint but don't
 * enumerate field names — this script calls it and prints the raw response
 * fields plus a privacy-redacted sample so we can decide:
 *
 *   - If `phone` (or similar) is populated → build syncDrivers.ts
 *   - If not → fall back to manual entry in admin UI
 *
 * Usage:
 *   pnpm exec tsx src/scripts/inspect-whiparound-drivers.ts <clerkOrgId>
 *
 * Reads the customer's Whiparound API key from the WhiparoundAccount table
 * (encrypted), so no key needs to be passed on the command line.
 */
import { getAppPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { WhiparoundClient } from '../integrations/whiparound/client.js';

interface RawDriver {
  id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  mobile_phone?: string;
  cell?: string;
  [k: string]: unknown;
}

function redactPhone(p: string | null | undefined): string {
  if (!p) return '(empty)';
  const digits = p.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error('Usage: tsx src/scripts/inspect-whiparound-drivers.ts <clerkOrgId>');
    process.exit(2);
  }

  const prisma = getAppPrisma();
  const account = await prisma.whiparoundAccount.findUnique({
    where: { clerkOrgId: orgId },
    select: { credentials: true, status: true },
  });
  if (!account) {
    console.error(`No WhiparoundAccount for clerkOrgId=${orgId}`);
    process.exit(1);
  }

  const creds = readCredentials(account.credentials);
  const apiKey = creds.apiKey as string | undefined;
  if (!apiKey) {
    console.error('WhiparoundAccount.credentials.apiKey is missing');
    process.exit(1);
  }

  const client = new WhiparoundClient(apiKey);
  console.log(`[Whiparound inspect] Fetching /drivers for org ${orgId} (status=${account.status})…`);

  let drivers: RawDriver[];
  // Try cursor pagination first, then fall back to classic if API responds with pagination metadata.
  try {
    drivers = await client.getAllCursor<RawDriver>('/drivers');
  } catch (err: any) {
    console.warn(`Cursor fetch failed (${err.message}); trying classic pagination…`);
    drivers = await client.getAllClassic<RawDriver>('/drivers');
  }

  if (!drivers.length) {
    console.log('Whiparound returned 0 drivers. Manual entry will be required.');
    process.exit(0);
  }

  // Field analysis
  const fieldCounts: Record<string, number> = {};
  for (const d of drivers) {
    for (const [k, v] of Object.entries(d)) {
      if (v != null && v !== '') fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
    }
  }

  console.log(`\nTotal drivers returned: ${drivers.length}`);
  console.log('Field population counts (non-null/non-empty):');
  for (const [k, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${count}/${drivers.length}`);
  }

  const phoneFields = ['phone', 'mobile', 'cell', 'phone_number', 'mobile_phone'];
  console.log('\nPhone-like field detection:');
  for (const pf of phoneFields) {
    if (fieldCounts[pf]) {
      console.log(`  ✓ Field "${pf}" populated for ${fieldCounts[pf]}/${drivers.length} drivers — usable for sync`);
    } else {
      console.log(`  ✗ Field "${pf}" empty or missing`);
    }
  }

  // Sample 5 redacted rows for visual confirmation
  console.log('\nSample (redacted):');
  for (const d of drivers.slice(0, 5)) {
    const fullName = d.name ?? `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim();
    const phone = (d.phone ?? d.mobile ?? d.mobile_phone ?? d.cell ?? '') as string;
    console.log(`  id=${d.id} name=${JSON.stringify(fullName)} email=${d.email ?? '(none)'} phone=${redactPhone(phone)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
