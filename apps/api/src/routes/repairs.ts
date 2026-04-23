/**
 * Repairs API Routes
 *
 * Purpose:
 * - Return repair data aggregated at the invoice ("number") level
 * - Group invoices under each unit
 * - Provide per-invoice unique service description lines for drill-down
 *
 * Scoping:
 * - REPAIR_SHOP_ORG_ID (fixed repair shop)
 * - customer name from APP DB config (per KL org)
 * - invoice_date >= contractStartDate (and optional query range)
 */
import { createHash } from 'crypto';
import { Router } from 'express';
import { clerkAuthMiddleware, requireOrg, AuthRequest } from '../middleware/auth.js';
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { cacheGetOrSetMeta } from '../lib/redis.js';
import { config } from '../config.js';
import { RepairsQuerySchema, PaginationSchema, parseQuery } from '../lib/validate.js';
import { parseDateActionCompletedToYmd, ymdMax } from '../lib/repairDateActionCompleted.js';

const router = Router();
/** Same window as before: 10h TTL for the raw revenue_details rows (shared across API instances). */
const REPAIRS_RAW_TTL_SECS = 10 * 60 * 60;

function repairsRawRedisKey(
  klOrgId: string,
  customerName: string,
  effectiveFromYmd: string,
  toYmdValue: string,
  allowedUnitNumbers: string[]
): string {
  const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
  const payload = JSON.stringify({
    customer: customerName,
    from: effectiveFromYmd,
    to: toYmdValue,
    units: [...allowedUnitNumbers].sort(),
    /** Bump when raw row shape/fields change (invalidates Redis blobs missing e.g. date_action_completed). */
    rawSchema: 'v3',
  });
  const h = createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `${env}:repairs:raw:${klOrgId}:${h}`;
}

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseYmdToDate(value: string): Date {
  // new Date('YYYY-MM-DD') is parsed as UTC midnight in JS
  return new Date(value);
}

function toYmd(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  if (typeof date === 'string') {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0] || null;
  }
  if (!(date instanceof Date)) return null;
  return date.toISOString().split('T')[0] || null;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** True if text mentions a drive-up (case-insensitive). Used for repair KPIs. */
function textMentionsDriveUp(s: string | null | undefined): boolean {
  const t = (s || '').toLowerCase();
  if (!t) return false;
  return /drive[\s,-]*up|driveup/.test(t);
}

/** Plain shape safe for JSON → Redis → JSON (Prisma Decimal / Date do not round-trip reliably). */
type RepairsRawRow = {
  id: number;
  unit: string | null;
  number: string | null;
  invoice_date: string | null;
  order_created_date: string | null;
  order: string | null;
  shop: string | null;
  service_description: string | null;
  global_service_description: string | null;
  part_description: string | null;
  complaint_description: string | null;
  type: string | null;
  total: number;
  sales_tax: number;
  component: string | null;
  system: string | null;
  date_action_completed: string | null;
};

type RevenueDetailSelected = {
  id: number;
  unit: string | null;
  number: string | null;
  invoice_date: Date | null;
  order_created_date: Date | null;
  order: string | null;
  shop: string | null;
  service_description: string | null;
  global_service_description: string | null;
  part_description: string | null;
  complaint_description: string | null;
  type: string | null;
  total: unknown;
  sales_tax: unknown;
  component: string | null;
  system: string | null;
  date_action_completed: string | null;
};

function toRepairsRawRows(rows: RevenueDetailSelected[]): RepairsRawRow[] {
  return rows.map((r) => ({
    id: r.id,
    unit: r.unit,
    number: r.number,
    invoice_date: r.invoice_date ? r.invoice_date.toISOString().split('T')[0]! : null,
    order_created_date: r.order_created_date
      ? r.order_created_date.toISOString().split('T')[0]!
      : null,
    order: r.order,
    shop: r.shop,
    service_description: r.service_description,
    global_service_description: r.global_service_description,
    part_description: r.part_description,
    complaint_description: r.complaint_description,
    type: r.type,
    total: toNumber(r.total),
    sales_tax: toNumber(r.sales_tax),
    component: r.component,
    system: r.system,
    date_action_completed: r.date_action_completed ?? null,
  }));
}

router.get('/', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const startedAt = Date.now();
    const fetchedAt = new Date().toISOString();
    const klOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const repairPrisma = getRepairPrisma();

    const config = await appPrisma.repairCustomerConfig.findUnique({
      where: { klOrgId },
      select: {
        klOrgId: true,
        customerName: true,
        contractStartDate: true,
      },
    });

    if (!config) {
      return res.status(409).json({
        error: 'MissingConfiguration',
        message:
          'Repair customer is not configured for this KL org. Set customer_name + contract_start_date first.',
        klOrgId,
      });
    }

    // Service plan unit numbers — only units included in the customer portal
    const includedUnits = await appPrisma.servicePlanUnit.findMany({
      where: { clerkOrgId: klOrgId, isIncluded: true },
      select: { repairUnitNumber: true },
    });

    const allowedUnitNumbers = includedUnits
      .map((u) => u.repairUnitNumber)
      .filter((n): n is string => !!n);

    const query = parseQuery(RepairsQuerySchema, req, res);
    if (!query) return;
    const pagination = parseQuery(PaginationSchema, req, res);
    if (!pagination) return;
    const { page, pageSize } = pagination;
    const requestedFrom = query.from;
    const requestedTo = query.to;

    const contractStartYmd = toYmd(config.contractStartDate) || '1970-01-01';
    
    console.log('[Repairs] Contract Config:', {
      klOrgId,
      customerName: config.customerName,
      dbContractStartDate: config.contractStartDate,
      parsedContractStartDate: contractStartYmd,
      requestedFrom,
      requestedTo
    });

    const fromYmd = requestedFrom ? String(requestedFrom) : contractStartYmd;
    const toYmdValue = requestedTo
      ? String(requestedTo)
      : new Date().toISOString().split('T')[0];

    // Clamp from to contract start
    // If fromYmd is BEFORE contract start, use contract start
    const effectiveFromYmd = fromYmd < contractStartYmd ? contractStartYmd : fromYmd;

    console.log('[Repairs] Date Range:', {
      fromYmd,
      contractStartYmd,
      effectiveFromYmd,
      comparison: `${fromYmd} < ${contractStartYmd} = ${fromYmd < contractStartYmd}`
    });

    const fromDate = parseYmdToDate(effectiveFromYmd);
    const toDate = parseYmdToDate(toYmdValue);

    if (allowedUnitNumbers.length === 0) {
      const elapsedMs = Date.now() - startedAt;
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('X-Cache', 'SKIP');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json({
        customer: {
          klOrgId: config.klOrgId,
          customerName: config.customerName,
          contractStartDate: contractStartYmd,
        },
        period: { from: effectiveFromYmd, to: toYmdValue },
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
        summary: {
          unitCount: 0,
          invoiceCount: 0,
          lineRowCount: 0,
          total: 0,
          tax: 0,
        },
        units: [],
      });
      return;
    }

    const cacheKey = repairsRawRedisKey(
      klOrgId,
      config.customerName,
      effectiveFromYmd,
      toYmdValue,
      allowedUnitNumbers
    );
    const { value: rows, hit } = await cacheGetOrSetMeta<RepairsRawRow[]>(
      cacheKey,
      REPAIRS_RAW_TTL_SECS,
      async () => {
        const raw = await repairPrisma.revenue_details.findMany({
          where: {
            organization_id: REPAIR_SHOP_ORG_ID,
            invoice_date: {
              not: null,
              gte: fromDate,
              lte: toDate,
            },
            customer: {
              equals: config.customerName,
              mode: 'insensitive',
            },
            // Filter by units included in the service plan
            unit: {
              in: allowedUnitNumbers,
            },
          },
          select: {
            id: true,
            unit: true,
            number: true, // invoice number
            invoice_date: true,
            order_created_date: true,
            order: true,
            shop: true,
            service_description: true,
            global_service_description: true,
            part_description: true,
            complaint_description: true,
            type: true,
            total: true,
            sales_tax: true,
            component: true,
            system: true,
            date_action_completed: true,
          },
          orderBy: [{ unit: 'asc' }, { invoice_date: 'desc' }, { number: 'asc' }],
        });
        return toRepairsRawRows(raw as RevenueDetailSelected[]);
      }
    );

    type LineAgg = {
      /** complaint_description */
      complaint: string | null;
      /** service_description only; may be "" when this line is complaint-only */
      correction: string;
      /** OR of per-row flags: any source row had drive-up in complaint, service, or global service text */
      hasDriveUpMention: boolean;
      component: string | null;
      system: string | null;
      total: number;
      tax: number;
      count: number;
    };

    type InvoiceAgg = {
      invoiceNumber: string;
      /** invoice / closed — Y-M-D */
      invoiceDate: string;
      orderCreatedDate: string | null;
      orderNumber: string | null;
      shop: string | null;
      total: number;
      tax: number;
      lineCount: number;
      /** Y-M-D: latest revenue_details.date_action_completed on the job (order closed) */
      orderClosedDate: string | null;
      lines: Map<string, LineAgg>;
    };

    type UnitAgg = {
      unitNumber: string;
      invoiceCount: number;
      total: number;
      tax: number;
      invoices: Map<string, InvoiceAgg>;
    };

    const units = new Map<string, UnitAgg>();
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
        ({
          unitNumber,
          invoiceCount: 0,
          total: 0,
          tax: 0,
          invoices: new Map(),
        } satisfies UnitAgg);

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
        } satisfies InvoiceAgg);

      if (!invoiceAgg.orderCreatedDate) {
        const ocd = toYmd(r.order_created_date);
        if (ocd) invoiceAgg.orderCreatedDate = ocd;
      }

      const lineCompletedYmd = parseDateActionCompletedToYmd(r.date_action_completed);
      if (lineCompletedYmd) {
        invoiceAgg.orderClosedDate = ymdMax(invoiceAgg.orderClosedDate, lineCompletedYmd);
      }

      const complaintRaw = (r.complaint_description || '').trim();
      // Many revenue_rows only populate global_service_description; service_description alone would drop all lines.
      const serviceRaw = (r.service_description || r.global_service_description || '').trim();
      if (!complaintRaw && !serviceRaw) continue;

      const complaint: string | null = complaintRaw || null;
      // Correction is labor/service text: prefer line-level service, else shop-global description (never part_description).
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

      // Only update if current value is missing/falsy AND new value is truthy (not null/empty string)
      // Also handle "N/A" string if it exists in DB
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

    // Finalize: compute counts + convert maps to arrays
    const unitList = Array.from(units.values()).map((u) => {
      const invoices = Array.from(u.invoices.values())
        .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
        .map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          orderCreatedDate: inv.orderCreatedDate,
          orderClosedDate: inv.orderClosedDate,
          orderNumber: inv.orderNumber,
          shop: inv.shop,
          total: Number(inv.total.toFixed(2)),
          tax: Number(inv.tax.toFixed(2)),
          lineCount: inv.lineCount,
          lines: Array.from(inv.lines.values()).sort((a, b) => b.total - a.total),
        }));

      const invoiceCountForUnit = invoices.length;
      const totalForUnit = invoices.reduce((sum, i) => sum + i.total, 0);
      const taxForUnit = invoices.reduce((sum, i) => sum + i.tax, 0);

      invoiceCount += invoiceCountForUnit;

      return {
        unitNumber: u.unitNumber,
        invoiceCount: invoiceCountForUnit,
        total: Number(totalForUnit.toFixed(2)),
        tax: Number(taxForUnit.toFixed(2)),
        invoices,
      };
    });

    unitList.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));

    // Apply pagination to the aggregated unit list
    const totalUnits = unitList.length;
    const pagedUnitList = unitList.slice((page - 1) * pageSize, page * pageSize);

    const elapsedMs = Date.now() - startedAt;
    console.log('[Repairs] GET /repairs', {
      fetchedAt,
      klOrgId,
      customerName: config.customerName,
      period: { from: effectiveFromYmd, to: toYmdValue },
      rawRows: Array.isArray(rows) ? rows.length : 0,
      unitCount: unitList.length,
      invoiceCount,
      lineRowCount,
      cache: hit ? 'HIT' : 'MISS',
      elapsedMs,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.setHeader('X-Elapsed-Ms', String(elapsedMs));
    res.json({
      customer: {
        klOrgId: config.klOrgId,
        customerName: config.customerName,
        contractStartDate: contractStartYmd,
      },
      period: { from: effectiveFromYmd, to: toYmdValue },
      pagination: {
        page,
        pageSize,
        total: totalUnits,
        totalPages: Math.ceil(totalUnits / pageSize),
      },
      summary: {
        unitCount: totalUnits,
        invoiceCount,
        lineRowCount,
        total: Number(grandTotal.toFixed(2)),
        tax: Number(grandTax.toFixed(2)),
      },
      units: pagedUnitList,
    });
  } catch (error) {
    console.error('[Repairs] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch repair data',
    });
  }
});

export default router;

