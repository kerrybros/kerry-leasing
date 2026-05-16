/**
 * INSPECT REPAIR HISTORY RANGE — one-off verification.
 *
 * Confirms how far back the external repair DB actually has data, now that the
 * /repairs view no longer clamps to contractStartDate. Prints:
 *   - overall MIN/MAX invoice_date for the repair shop org
 *   - per configured customer: MIN invoice_date vs their contractStartDate
 *     (so we can see how much pre-contract history just became visible)
 *
 * Read-only aggregates only. Usage:
 *   pnpm exec tsx src/scripts/inspect-repair-history-range.ts
 */
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';

function ymd(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

async function main() {
  const repair = getRepairPrisma();
  const app = getAppPrisma();

  const overall = await repair.revenue_details.aggregate({
    where: { organization_id: REPAIR_SHOP_ORG_ID, invoice_date: { not: null } },
    _min: { invoice_date: true },
    _max: { invoice_date: true },
    _count: { _all: true },
  });

  console.log('\n=== Repair DB — overall (org %s) ===', REPAIR_SHOP_ORG_ID);
  console.log('  earliest invoice_date :', ymd(overall._min.invoice_date));
  console.log('  latest   invoice_date :', ymd(overall._max.invoice_date));
  console.log('  total rows            :', overall._count._all.toLocaleString());

  const configs = await app.repairCustomerConfig.findMany({
    select: { klOrgId: true, customerName: true, contractStartDate: true },
  });

  console.log('\n=== Per configured customer ===');
  for (const c of configs) {
    if (!c.customerName) {
      console.log(`  [${c.klOrgId}] (no customerName configured)`);
      continue;
    }
    const agg = await repair.revenue_details.aggregate({
      where: {
        organization_id: REPAIR_SHOP_ORG_ID,
        invoice_date: { not: null },
        customer: { equals: c.customerName, mode: 'insensitive' },
      },
      _min: { invoice_date: true },
      _max: { invoice_date: true },
      _count: { _all: true },
    });
    const earliest = agg._min.invoice_date;
    const contractStart = c.contractStartDate;
    const preContract =
      earliest && contractStart && earliest < contractStart
        ? `${Math.round(
            (contractStart.getTime() - earliest.getTime()) / (365.25 * 86_400_000)
          )} yr of pre-contract history now visible`
        : 'no pre-contract history';
    console.log(
      `  ${c.customerName} (${c.klOrgId})\n` +
        `    contractStart : ${ymd(contractStart)}\n` +
        `    earliest data : ${ymd(earliest)}  | latest: ${ymd(agg._max.invoice_date)} | rows: ${agg._count._all.toLocaleString()}\n` +
        `    → ${preContract}`
    );
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
