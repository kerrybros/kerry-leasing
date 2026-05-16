/**
 * READ-ONLY parity check for the repairs aggregation refactor.
 *
 * Proves the new (shipping) aggregateRepairs() produces output identical to the
 * pre-refactor logic (transcribed verbatim from git HEAD) for every configured
 * customer, over both the default 12-month window and full all-time history.
 *
 * Only reads: revenue_details.findMany + repairCustomerConfig.findMany. No
 * writes, no Redis. Safe against the production repair DB.
 *
 *   pnpm exec tsx src/scripts/verify-repairs-aggregation-parity.ts
 */
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { parseDateActionCompletedToYmd, ymdMax } from '../lib/repairDateActionCompleted.js';
import {
  toYmd,
  toNumber,
  textMentionsDriveUp,
  toRepairsRawRows,
  aggregateRepairs,
  type RepairsRawRow,
} from '../routes/repairs.js';

const SELECT = {
  id: true, unit: true, number: true, invoice_date: true,
  order_created_date: true, order: true, shop: true,
  service_description: true, global_service_description: true,
  part_description: true, complaint_description: true, type: true,
  total: true, sales_tax: true, component: true, system: true,
  date_action_completed: true,
} as const;

// ---- OLD aggregation: transcribed verbatim from git HEAD's repairs.ts ----
function aggregateRepairsOld(rows: RepairsRawRow[]) {
  const units = new Map<string, any>();
  let invoiceCount = 0;
  let lineRowCount = 0;
  let grandTotal = 0;
  let grandTax = 0;

  for (const r of rows) {
    const unitNumber = (r.unit || '').trim();
    const invoiceNumber = (r.number || '').trim();
    const invoiceDateYmd = toYmd(r.invoice_date) || null;

    if (!unitNumber || !invoiceNumber || !invoiceDateYmd) continue;

    const unitKey = unitNumber;
    const invoiceKey = `${invoiceNumber}::${invoiceDateYmd}`;

    const unitAgg =
      units.get(unitKey) ||
      ({ unitNumber, invoiceCount: 0, total: 0, tax: 0, invoices: new Map() });

    const invoiceAgg =
      unitAgg.invoices.get(invoiceKey) ||
      ({
        invoiceNumber,
        invoiceDate: invoiceDateYmd,
        orderCreatedDate: toYmd(r.order_created_date),
        orderNumber: r.order || null,
        shop: r.shop || null,
        total: 0,
        tax: 0,
        lineCount: 0,
        orderClosedDate: null,
        lines: new Map(),
      });

    if (!invoiceAgg.orderCreatedDate) {
      const ocd = toYmd(r.order_created_date);
      if (ocd) invoiceAgg.orderCreatedDate = ocd;
    }

    const lineCompletedYmd = parseDateActionCompletedToYmd(r.date_action_completed);
    if (lineCompletedYmd) {
      invoiceAgg.orderClosedDate = ymdMax(invoiceAgg.orderClosedDate, lineCompletedYmd);
    }

    const complaintRaw = (r.complaint_description || '').trim();
    const serviceRaw = (r.service_description || r.global_service_description || '').trim();
    if (!complaintRaw && !serviceRaw) continue;

    const complaint: string | null = complaintRaw || null;
    const correction = (r.service_description || '').trim() || (r.global_service_description || '').trim();

    const lineKey = `${complaintRaw}\u0000${serviceRaw}`;

    const lineTotal = toNumber(r.total);
    const lineTax = toNumber(r.sales_tax);

    const rowHasDriveUp =
      textMentionsDriveUp(r.complaint_description) ||
      textMentionsDriveUp(r.service_description) ||
      textMentionsDriveUp(r.global_service_description);

    const line =
      invoiceAgg.lines.get(lineKey) || {
        complaint,
        correction,
        hasDriveUpMention: rowHasDriveUp,
        component: null,
        system: null,
        total: 0,
        tax: 0,
        count: 0,
      };
    line.hasDriveUpMention = line.hasDriveUpMention || rowHasDriveUp;

    const isInvalid = (val: string | null) => !val || val === 'N/A' || val.trim() === '';

    if (isInvalid(line.component) && !isInvalid(r.component)) line.component = r.component;
    if (isInvalid(line.system) && !isInvalid(r.system)) line.system = r.system;

    line.total += lineTotal;
    line.tax += lineTax;
    line.count += 1;
    invoiceAgg.lines.set(lineKey, line);

    invoiceAgg.total += lineTotal;
    invoiceAgg.tax += lineTax;
    invoiceAgg.lineCount += 1;

    unitAgg.invoices.set(invoiceKey, invoiceAgg);
    units.set(unitKey, unitAgg);

    lineRowCount += 1;
    grandTotal += lineTotal;
    grandTax += lineTax;
  }

  const unitList = Array.from(units.values()).map((u: any) => {
    const invoices = Array.from(u.invoices.values())
      .sort((a: any, b: any) => b.invoiceDate.localeCompare(a.invoiceDate))
      .map((inv: any) => ({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        orderCreatedDate: inv.orderCreatedDate,
        orderClosedDate: inv.orderClosedDate,
        orderNumber: inv.orderNumber,
        shop: inv.shop,
        total: Number(inv.total.toFixed(2)),
        tax: Number(inv.tax.toFixed(2)),
        lineCount: inv.lineCount,
        lines: Array.from(inv.lines.values()).sort((a: any, b: any) => b.total - a.total),
      }));

    const invoiceCountForUnit = invoices.length;
    const totalForUnit = invoices.reduce((sum: number, i: any) => sum + i.total, 0);
    const taxForUnit = invoices.reduce((sum: number, i: any) => sum + i.tax, 0);

    invoiceCount += invoiceCountForUnit;

    return {
      unitNumber: u.unitNumber,
      invoiceCount: invoiceCountForUnit,
      total: Number(totalForUnit.toFixed(2)),
      tax: Number(taxForUnit.toFixed(2)),
      invoices,
    };
  });

  unitList.sort((a: any, b: any) => a.unitNumber.localeCompare(b.unitNumber));

  // OLD response emitted grandTotal/grandTax as Number(x.toFixed(2)); mirror
  // that here so we compare response-equivalent values.
  return {
    unitList,
    invoiceCount,
    lineRowCount,
    grandTotal: Number(grandTotal.toFixed(2)),
    grandTax: Number(grandTax.toFixed(2)),
  };
}

async function fetchRows(customer: string, gte: Date): Promise<RepairsRawRow[]> {
  const repair = getRepairPrisma();
  const raw = await repair.revenue_details.findMany({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID,
      invoice_date: { not: null, gte },
      customer: { equals: customer, mode: 'insensitive' },
    },
    select: SELECT,
    orderBy: [{ unit: 'asc' }, { invoice_date: 'desc' }, { number: 'asc' }],
  });
  return toRepairsRawRows(raw as any);
}

function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const s = Math.max(0, i - 60);
      return `at char ${i}:\n  NEW …${a.slice(s, i + 60)}…\n  OLD …${b.slice(s, i + 60)}…`;
    }
  }
  return `length differs: new=${a.length} old=${b.length}`;
}

async function main() {
  const app = getAppPrisma();
  const configs = await app.repairCustomerConfig.findMany({
    select: { customerName: true },
  });
  const now = new Date();
  const t12 = new Date(now);
  t12.setMonth(t12.getMonth() - 12);
  const ranges: { label: string; gte: Date }[] = [
    { label: 'trailing-12mo', gte: t12 },
    { label: 'all-time', gte: new Date('2000-01-01') },
  ];

  let allMatch = true;
  for (const c of configs) {
    if (!c.customerName) continue;
    for (const range of ranges) {
      const rows = await fetchRows(c.customerName, range.gte);
      const neu = aggregateRepairs(rows);
      const old = aggregateRepairsOld(rows);
      const sNew = JSON.stringify(neu);
      const sOld = JSON.stringify(old);
      const match = sNew === sOld;
      if (!match) allMatch = false;
      console.log(
        `  ${match ? '✓ MATCH ' : '✗ DIFFER'}  ${c.customerName} [${range.label}]  ` +
          `rows=${rows.length} units=${neu.unitList.length} ` +
          `inv=${neu.invoiceCount} lines=${neu.lineRowCount} ` +
          `total=${neu.grandTotal} tax=${neu.grandTax}`
      );
      if (!match) console.log('    ' + firstDiff(sNew, sOld));
    }
  }
  console.log('');
  console.log(allMatch
    ? '*** PARITY CONFIRMED — new aggregation is byte-identical to HEAD for every customer & range ***'
    : '*** PARITY FAILED — review differences above ***');
  process.exit(allMatch ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
