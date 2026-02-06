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
import { Router } from 'express';
import { clerkAuthMiddleware, requireOrg, AuthRequest } from '../middleware/auth.js';
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { TtlCache } from '../lib/ttlCache.js';

const router = Router();
const IS_DEV = process.env.NODE_ENV === 'development';
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
// In dev, use a very short TTL (e.g. 1 second) or 0 to effectively disable long-term caching
const CACHE_TTL = 0; // DISABLED FOR DEBUGGING
const repairsCache = new TtlCache<any>(CACHE_TTL, 500);

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseYmdToDate(value: string): Date {
  // new Date('YYYY-MM-DD') is parsed as UTC midnight in JS
  return new Date(value);
}

function toYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0] || null;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

    // Get all included service plan units for this org to filter repairs
    const includedUnits = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId: klOrgId,
        isIncluded: true,
      },
      select: { repairUnitNumber: true },
    });

    const allowedUnitNumbers = includedUnits
      .map((u) => u.repairUnitNumber)
      .filter((n): n is string => !!n);

    console.log('[Repairs] Filtering:', {
      klOrgId,
      totalIncludedUnits: allowedUnitNumbers.length,
      has221E: allowedUnitNumbers.includes('221-E'),
      sample: allowedUnitNumbers.slice(0, 5)
    });

    const requestedFrom = req.query.from;
    const requestedTo = req.query.to;

    if (requestedFrom && !isYmd(requestedFrom)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Query param "from" must be YYYY-MM-DD',
      });
    }

    if (requestedTo && !isYmd(requestedTo)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Query param "to" must be YYYY-MM-DD',
      });
    }

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

    const cacheKey = `repairs:${klOrgId}:${config.customerName.toLowerCase()}:${effectiveFromYmd}:${toYmdValue}`;
    const { value: rows, hit } = await repairsCache.getOrSet(cacheKey, async () => {
      return await repairPrisma.revenue_details.findMany({
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
        },
        orderBy: [{ unit: 'asc' }, { invoice_date: 'desc' }, { number: 'asc' }],
      });
    });

    type LineAgg = {
      description: string;
      component: string | null;
      system: string | null;
      total: number;
      tax: number;
      count: number;
    };

    type InvoiceAgg = {
      invoiceNumber: string;
      invoiceDate: string;
      orderNumber: string | null;
      shop: string | null;
      total: number;
      tax: number;
      lineCount: number;
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
          orderNumber: r.order || null,
          shop: r.shop || null,
          total: 0,
          tax: 0,
          lineCount: 0,
          lines: new Map(),
        } satisfies InvoiceAgg);

      const description =
        (r.service_description ||
          r.global_service_description ||
          r.part_description ||
          r.complaint_description ||
          '').trim() || '(No description)';

      const lineTotal = toNumber(r.total);
      const lineTax = toNumber(r.sales_tax);

      const line =
        invoiceAgg.lines.get(description) || {
          description,
          component: null,
          system: null,
          total: 0,
          tax: 0,
          count: 0,
        };

      // Only update if current value is missing/falsy AND new value is truthy (not null/empty string)
      // Also handle "N/A" string if it exists in DB
      const isInvalid = (val: string | null) => !val || val === 'N/A' || val.trim() === '';
      
      if (isInvalid(line.component) && !isInvalid(r.component)) line.component = r.component;
      if (isInvalid(line.system) && !isInvalid(r.system)) line.system = r.system;

      line.total += lineTotal;
      line.tax += lineTax;
      line.count += 1;
      invoiceAgg.lines.set(description, line);

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
      period: {
        from: effectiveFromYmd,
        to: toYmdValue,
      },
      summary: {
        unitCount: unitList.length,
        invoiceCount,
        lineRowCount,
        total: Number(grandTotal.toFixed(2)),
        tax: Number(grandTax.toFixed(2)),
      },
      units: unitList,
    });
  } catch (error) {
    console.error('[Repairs] Error:', error);
    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to fetch repair data',
    });
  }
});

export default router;

