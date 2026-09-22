/**
 * Route Motive scheduled-report emails to an org: store the company name
 * exactly as it appears in the email body ("...from WOLVERINE PACKING COMPANY is").
 *
 *   pnpm exec tsx src/scripts/set-motive-report-company.ts --org=<clerkOrgId> --company="WOLVERINE PACKING COMPANY"
 */
import { getAppPrisma } from '../lib/prisma.js';

async function main() {
  const org = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1];
  const company = process.argv.find((a) => a.startsWith('--company='))?.slice('--company='.length);
  if (!org || !company) throw new Error('--org= and --company= required');
  const prisma = getAppPrisma();
  const acct = await prisma.telematicsProviderAccount.update({
    where: { clerkOrgId: org },
    data: { motiveReportCompanyName: company },
    select: { clerkOrgId: true, provider: true, status: true, motiveReportCompanyName: true },
  });
  console.log(acct);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
