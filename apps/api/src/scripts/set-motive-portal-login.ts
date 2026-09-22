/**
 * Store the dedicated Motive dashboard login for an org inside its existing
 * encrypted credentials blob (next to the API key). The password is read from
 * STDIN so it never appears in shell history or process args.
 *
 *   printf '%s' "$PASSWORD" | pnpm exec tsx src/scripts/set-motive-portal-login.ts --org=<clerkOrgId> --email=motive-reports@kerrybros.com
 *   pnpm exec tsx src/scripts/set-motive-portal-login.ts --org=<clerkOrgId> --clear
 */
import { getAppPrisma } from '../lib/prisma.js';
import { readCredentials, encryptCredentials } from '../lib/credentials.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const org = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1];
  const email = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
  const clear = process.argv.includes('--clear');
  if (!org || (!email && !clear)) throw new Error('--org=<clerkOrgId> and --email=<login> (or --clear) required');
  const prisma = getAppPrisma();
  const acct = await prisma.telematicsProviderAccount.findUnique({ where: { clerkOrgId: org }, select: { credentialsJson: true, provider: true } });
  if (!acct) throw new Error(`No telematics account for ${org}`);
  const creds = readCredentials(acct.credentialsJson);
  if (clear) {
    delete creds.portalEmail; delete creds.portalPassword;
  } else {
    const password = await readStdin();
    if (!password) throw new Error('Password must be piped on stdin');
    creds.portalEmail = email; creds.portalPassword = password;
  }
  await prisma.telematicsProviderAccount.update({
    where: { clerkOrgId: org },
    data: { credentialsJson: encryptCredentials(creds) },
    select: { clerkOrgId: true },
  });
  console.log(`${org}: portal login ${clear ? 'cleared' : `set for ${email}`} (keys now: ${Object.keys(creds).join(', ')})`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
