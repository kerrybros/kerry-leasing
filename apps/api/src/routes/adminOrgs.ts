/**
 * ADMIN ORGS ROUTES
 * Customer (org) onboarding and management endpoints.
 * All endpoints require Clerk auth + internal role.
 */

import { Router } from 'express';
import { createClerkClient } from '@clerk/backend';
import { clerkAuthMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { getAppPrisma } from '../lib/prisma.js';
import { getDistinctCustomers } from '../db/repairRepo.js';
import { encryptCredentials } from '../lib/credentials.js';
import { MotiveClient } from '../telematics/motive/client.js';
import { SamsaraClient } from '../telematics/samsara/client.js';
import { WhiparoundClient } from '../integrations/whiparound/client.js';
import { syncWhiparoundOrg } from '../integrations/whiparound/syncService.js';
import { backdateMotiveData } from '../telematics/motive/backdate.js';
import { backdateSamsaraData } from '../telematics/samsara/backdate.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { CronJobType, ServicePlanMatchType } from '../generated/app-client/index.js';
import { cronStepApiPaths } from '../lib/cronStepApiPaths.js';
import { createId } from '@paralleldrive/cuid2';
import { config } from '../config.js';
import { loadSamsaraTelematicsVinSetForServicePlan } from '../lib/servicePlanSamsaraTelematics.js';
import { invalidateCachesAfterServicePlanChange } from '../lib/fleetCache.js';

const router = Router();

// All routes in this file require auth + internal role
router.use(clerkAuthMiddleware);
router.use(requireRole(['internal']));

const clerk = createClerkClient({ secretKey: config.clerk.secretKey });

// ---------------------------------------------------------------------------
// GET /admin/orgs
// List all customer orgs with provider account status, vehicle counts, etc.
// ---------------------------------------------------------------------------
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const appPrisma = getAppPrisma();

    const [accounts, samsaraVehicleCounts, motiveVehicleCounts, repairConfigs, orgSettings] = await Promise.all([
      appPrisma.telematicsProviderAccount.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
      appPrisma.telematicsVehicleMap.groupBy({
        by: ['clerkOrgId'],
        _count: { id: true },
      }),
      appPrisma.motiveVehicleUtilization.groupBy({
        by: ['clerkOrgId', 'vehicleId'],
        _count: { id: true },
      }),
      appPrisma.repairCustomerConfig.findMany(),
      appPrisma.organizationSettings.findMany(),
    ]);

    // Samsara: one row per vehicle in telematicsVehicleMap
    const samsaraVehicleMap = new Map(samsaraVehicleCounts.map((v) => [v.clerkOrgId, v._count.id]));
    // Motive: count distinct vehicleId per org
    const motiveVehicleMap = new Map<string, number>();
    for (const row of motiveVehicleCounts) {
      motiveVehicleMap.set(row.clerkOrgId, (motiveVehicleMap.get(row.clerkOrgId) ?? 0) + 1);
    }
    const vehicleMap = new Map<string, number>();
    for (const [orgId, count] of samsaraVehicleMap) vehicleMap.set(orgId, count);
    for (const [orgId, count] of motiveVehicleMap) vehicleMap.set(orgId, (vehicleMap.get(orgId) ?? 0) + count);
    const repairMap = new Map(repairConfigs.map((r) => [r.klOrgId, r]));
    const settingsMap = new Map(orgSettings.map((s) => [s.clerkOrgId, s]));

    // Enrich with Clerk org names (batch — one call per account for now)
    const orgs = await Promise.all(
      accounts.map(async (acct) => {
        let clerkOrgName: string | null = null;
        try {
          const clerkOrg = await clerk.organizations.getOrganization({ organizationId: acct.clerkOrgId });
          clerkOrgName = clerkOrg.name ?? null;
        } catch {
          // Clerk org may not exist (legacy data) — continue
        }

        const repair = repairMap.get(acct.clerkOrgId);
        const settings = settingsMap.get(acct.clerkOrgId);

        return {
          clerkOrgId: acct.clerkOrgId,
          displayName: clerkOrgName,
          provider: acct.provider,
          status: acct.status,
          lastSyncAt: acct.lastSyncAt,
          lastError: acct.lastError,
          vehicleCount: vehicleMap.get(acct.clerkOrgId) ?? 0,
          repairCustomerName: repair?.customerName ?? null,
          contractStartDate: repair?.contractStartDate
            ? repair.contractStartDate.toISOString().split('T')[0]
            : null,
          tracksDrivers: settings?.tracksDrivers ?? true,
          contractTermYears: settings?.contractTermYears ?? null,
          createdAt: acct.createdAt,
        };
      })
    );

    res.json({ orgs });
  } catch (err) {
    console.error('[adminOrgs] GET /admin/orgs error:', err);
    res.status(500).json({ error: 'Failed to fetch orgs' });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/repair-customers
// Returns distinct customers from the repair DB for the onboarding dropdown.
// ---------------------------------------------------------------------------
router.get('/repair-customers', async (_req: AuthRequest, res) => {
  try {
    const customers = await getDistinctCustomers();
    res.json({ customers });
  } catch (err) {
    console.error('[adminOrgs] GET /admin/orgs/repair-customers error:', err);
    res.status(500).json({ error: 'Failed to fetch repair customers' });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/validate-credentials
// Test a provider API key before saving. Does NOT write to DB.
// Body: { provider: 'MOTIVE' | 'SAMSARA'; apiKey: string }
// ---------------------------------------------------------------------------
router.post('/validate-credentials', async (req: AuthRequest, res) => {
  try {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };

    if (!provider || !apiKey?.trim()) {
      return res.status(400).json({ valid: false, error: 'provider and apiKey are required' });
    }

    let valid = false;
    let error: string | null = null;

    if (provider === 'MOTIVE') {
      const client = new MotiveClient(apiKey.trim());
      try {
        valid = await client.testConnection();
        if (!valid) error = 'Motive API key did not return a successful response';
      } catch (e: any) {
        error = e.message ?? 'Motive credential check failed';
      }
    } else if (provider === 'SAMSARA') {
      const client = new SamsaraClient(apiKey.trim());
      try {
        valid = await client.testConnection();
        if (!valid) error = 'Samsara API token did not return a successful response';
      } catch (e: any) {
        error = e.message ?? 'Samsara credential check failed';
      }
    } else {
      return res.status(400).json({ valid: false, error: `Unknown provider: ${provider}` });
    }

    res.json({ valid, error });
  } catch (err: any) {
    console.error('[adminOrgs] POST /admin/orgs/validate-credentials error:', err);
    res.status(500).json({ valid: false, error: err.message ?? 'Validation error' });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/create
// Full onboarding: creates Clerk org + all 4 DB records + fires backdate.
// Body:
//   displayName        string   - Customer display name (e.g. "Wolverine Packing")
//   provider           string   - 'MOTIVE' | 'SAMSARA'
//   apiKey             string   - Provider API key/token
//   contractStartDate  string   - ISO date string (YYYY-MM-DD)
//   repairCustomerId   string?  - cust_id from repair DB (optional)
//   repairCustomerName string?  - customer name from repair DB (optional)
//   tracksDrivers      boolean  - Whether org uses driver tracking (default: true)
//   contractTermYears  number?  - 1-5 years (optional)
// ---------------------------------------------------------------------------
router.post('/create', async (req: AuthRequest, res) => {
  try {
    const {
      displayName,
      provider,
      apiKey,
      contractStartDate,
      repairCustomerId,
      repairCustomerName,
      tracksDrivers = true,
      contractTermYears,
      serviceRequestUrl,
    } = req.body as {
      displayName: string;
      provider: string;
      apiKey: string;
      contractStartDate: string;
      repairCustomerId?: string;
      repairCustomerName?: string;
      tracksDrivers?: boolean;
      contractTermYears?: number;
      serviceRequestUrl?: string;
    };

    // Basic validation
    if (!displayName?.trim()) return res.status(400).json({ error: 'displayName is required' });
    if (!provider || !['MOTIVE', 'SAMSARA'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be MOTIVE or SAMSARA' });
    }
    if (!apiKey?.trim()) return res.status(400).json({ error: 'apiKey is required' });
    if (!contractStartDate) return res.status(400).json({ error: 'contractStartDate is required' });

    // 1. Create Clerk organization
    const clerkOrg = await clerk.organizations.createOrganization({
      name: displayName.trim(),
    });
    const clerkOrgId = clerkOrg.id;

    // Add the onboarding user as an org:admin automatically
    const onboardingUserId = (req as AuthRequest).auth?.userId;
    if (onboardingUserId) {
      await clerk.organizations.createOrganizationMembership({
        organizationId: clerkOrgId,
        userId: onboardingUserId,
        role: 'org:admin',
      });
    }

    // 2. Encrypt credentials
    const credentials = provider === 'MOTIVE'
      ? { apiKey: apiKey.trim() }
      : { apiToken: apiKey.trim() };
    const encryptedCredentials = encryptCredentials(credentials);

    // 3. Write all DB records in a transaction
    const appPrisma = getAppPrisma();
    await appPrisma.$transaction(async (tx) => {
      await tx.telematicsProviderAccount.create({
        data: {
          clerkOrgId,
          provider: provider as 'MOTIVE' | 'SAMSARA',
          credentialsJson: encryptedCredentials,
          status: 'ACTIVE',
        },
      });

      await tx.organizationSettings.create({
        data: {
          clerkOrgId,
          tracksDrivers: Boolean(tracksDrivers),
          contractTermYears: contractTermYears ?? null,
          serviceRequestUrl: serviceRequestUrl?.trim() || null,
        },
      });

      if (repairCustomerName?.trim()) {
        await tx.repairCustomerConfig.create({
          data: {
            klOrgId: clerkOrgId,
            customerName: repairCustomerName.trim(),
            contractStartDate: new Date(contractStartDate),
          },
        });
      }

      if (repairCustomerId?.trim()) {
        await tx.customerOrgMap.create({
          data: {
            clerkOrgId,
            customerId: repairCustomerId.trim(),
          },
        });
      }
    });

    // 4. Fire backdate + service plan sync in background (non-blocking)
    const backdateStart = contractStartDate;
    const backdateEnd = new Date().toISOString().split('T')[0];

    setImmediate(async () => {
      try {
        console.log(`[adminOrgs] Starting backdate for ${clerkOrgId} (${backdateStart} → ${backdateEnd})`);
        const run = provider === 'MOTIVE'
          ? backdateMotiveData({ clerkOrgId, startDate: backdateStart, endDate: backdateEnd })
          : backdateSamsaraData({ clerkOrgId, startDate: backdateStart, endDate: backdateEnd });
        await run;
        console.log(`[adminOrgs] Backdate complete for ${clerkOrgId}. Triggering service plan sync...`);
        await triggerServicePlanSync(clerkOrgId, repairCustomerName?.trim() ?? null, new Date(contractStartDate), provider as 'MOTIVE' | 'SAMSARA');
      } catch (err) {
        console.error(`[adminOrgs] Background setup failed for ${clerkOrgId}:`, err);
      }
    });

    res.json({
      ok: true,
      clerkOrgId,
      displayName: displayName.trim(),
      provider,
      backdateStarted: true,
      backdateRange: { start: backdateStart, end: backdateEnd },
    });
  } catch (err: any) {
    console.error('[adminOrgs] POST /admin/orgs/create error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to create org' });
  }
});

// ---------------------------------------------------------------------------
// Internal: run a service plan sync for a freshly created org.
// Mirrors the logic in POST /admin/service-plan/sync but called directly.
// ---------------------------------------------------------------------------
async function triggerServicePlanSync(
  clerkOrgId: string,
  repairCustomerName: string | null,
  contractStartDate: Date,
  provider: 'MOTIVE' | 'SAMSARA'
) {
  if (!repairCustomerName) {
    console.log(`[adminOrgs] No repair customer name for ${clerkOrgId} — skipping service plan sync`);
    return;
  }

  const appPrisma = getAppPrisma();
  const { getRepairPrisma } = await import('../lib/prisma.js');
  const repairPrisma = getRepairPrisma();

  // Pull the distinct set of unit numbers with invoice activity since contract start.
  // Postgres does the DISTINCT at query time — we never materialize the full row set in Node.
  const activeUnitRows = await repairPrisma.revenue_details.findMany({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID,
      invoice_date: { gte: contractStartDate },
      customer: { equals: repairCustomerName, mode: 'insensitive' },
    },
    distinct: ['unit'],
    select: { unit: true },
  });
  const activeUnitNumbers = new Set(
    activeUnitRows.map(r => r.unit).filter((u): u is string => !!u)
  );

  const allUnits = await repairPrisma.customer_units.findMany({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID,
      customer: { equals: repairCustomerName, mode: 'insensitive' },
    },
  });
  const customerUnits = allUnits.filter((u: any) => u.number && activeUnitNumbers.has(u.number));

  // Pull telematics VINs
  let telematicsVins: Set<string>;
  if (provider === 'MOTIVE') {
    telematicsVins = new Set<string>();
    const rows = await appPrisma.motiveVehicleUtilization.findMany({
      where: { clerkOrgId, vin: { not: null } },
      select: { vin: true },
      distinct: ['vin'],
    });
    rows.forEach((r) => {
      if (r.vin) telematicsVins.add(r.vin.trim());
    });
  } else {
    telematicsVins = await loadSamsaraTelematicsVinSetForServicePlan(appPrisma, clerkOrgId);
  }

  // Upsert service plan units
  for (const unit of customerUnits) {
    const repairVin = (unit as any).vin?.trim() || null;
    const matched = repairVin && telematicsVins.has(repairVin);
    await (appPrisma.servicePlanUnit as any).upsert({
      where: { clerkOrgId_repairUnitId: { clerkOrgId, repairUnitId: (unit as any).unit_id } },
      create: {
        clerkOrgId,
        repairUnitId: (unit as any).unit_id,
        repairUnitNumber: (unit as any).number,
        repairVin,
        repairCustomerId: (unit as any).cust_id,
        telematicsVin: matched ? repairVin : null,
        matchType: matched ? ServicePlanMatchType.AUTO : ServicePlanMatchType.UNMATCHED,
        matchConfidence: matched ? 1.0 : null,
        isIncluded: true,
        lastSyncedAt: new Date(),
      },
      update: {
        repairUnitNumber: (unit as any).number,
        repairVin,
        telematicsVin: matched ? repairVin : null,
        matchType: matched ? ServicePlanMatchType.AUTO : ServicePlanMatchType.UNMATCHED,
        lastSyncedAt: new Date(),
      },
    });
  }

  // Add telematics-only entries for VINs not in repair data
  const repairVins = new Set(customerUnits.map((u: any) => u.vin?.trim()).filter(Boolean));
  for (const vin of telematicsVins) {
    if (!repairVins.has(vin)) {
      const exists = await (appPrisma.servicePlanUnit as any).findFirst({
        where: { clerkOrgId, telematicsVin: vin },
      });
      if (!exists) {
        await (appPrisma.servicePlanUnit as any).create({
          data: {
            clerkOrgId,
            repairUnitId: createId(),
            repairVin: null,
            repairCustomerId: null,
            telematicsVin: vin,
            isTelematicsOnly: true,
            matchType: ServicePlanMatchType.UNMATCHED,
            isIncluded: true,
            lastSyncedAt: new Date(),
          },
        });
      }
    }
  }

  console.log(`[adminOrgs] Service plan sync complete for ${clerkOrgId}: ${customerUnits.length} repair units, ${telematicsVins.size} telematics VINs`);
}

// ---------------------------------------------------------------------------
// GET /admin/orgs/:clerkOrgId/fleet
// Returns service plan units for a specific org (super-admin view).
// ---------------------------------------------------------------------------
router.get('/:clerkOrgId/fleet', async (req: AuthRequest, res) => {
  try {
    const { clerkOrgId } = req.params;
    const appPrisma = getAppPrisma();

    const [units, account] = await Promise.all([
      appPrisma.servicePlanUnit.findMany({
        where: { clerkOrgId },
        orderBy: [{ repairUnitNumber: 'asc' }],
      }),
      appPrisma.telematicsProviderAccount.findFirst({
        where: { clerkOrgId },
        select: { provider: true, status: true, lastSyncAt: true },
      }),
    ]);

    const total = units.length;
    const included = units.filter(u => u.isIncluded).length;
    const excluded = total - included;
    const matched = units.filter(u => u.matchType !== 'UNMATCHED').length;
    const unmatched = total - matched;

    res.json({
      units,
      summary: { total, included, excluded, matched, unmatched },
      providerStatus: account ?? null,
    });
  } catch (err: any) {
    console.error('[adminOrgs] GET /:clerkOrgId/fleet error:', err);
    res.status(500).json({ error: 'Failed to fetch fleet units' });
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/orgs/:clerkOrgId/fleet/units/:unitId/inclusion
// Toggle isIncluded for a single service plan unit (super-admin).
// ---------------------------------------------------------------------------
router.put('/:clerkOrgId/fleet/units/:unitId/inclusion', async (req: AuthRequest, res) => {
  try {
    const { clerkOrgId, unitId } = req.params;
    const { isIncluded } = req.body as { isIncluded: boolean };

    if (typeof isIncluded !== 'boolean') {
      return res.status(400).json({ error: 'isIncluded must be a boolean' });
    }

    const appPrisma = getAppPrisma();
    const unit = await appPrisma.servicePlanUnit.update({
      where: { id: unitId, clerkOrgId },
      data: { isIncluded },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ unit });
  } catch (err: any) {
    console.error('[adminOrgs] PUT /:clerkOrgId/fleet/units/:unitId/inclusion error:', err);
    res.status(500).json({ error: 'Failed to update unit inclusion' });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/:clerkOrgId/fleet/sync
// Re-runs the service plan sync for a specific org (super-admin).
// ---------------------------------------------------------------------------
router.post('/:clerkOrgId/fleet/sync', async (req: AuthRequest, res) => {
  try {
    const { clerkOrgId } = req.params;
    const appPrisma = getAppPrisma();

    const [repairConfig, account] = await Promise.all([
      appPrisma.repairCustomerConfig.findUnique({
        where: { klOrgId: clerkOrgId },
        select: { customerName: true, contractStartDate: true },
      }),
      appPrisma.telematicsProviderAccount.findFirst({
        where: { clerkOrgId },
        select: { provider: true },
      }),
    ]);

    if (!repairConfig) {
      return res.status(409).json({ error: 'No repair customer configured for this org. Link a repair customer first.' });
    }
    if (!account) {
      return res.status(409).json({ error: 'No telematics provider account found for this org.' });
    }

    await triggerServicePlanSync(
      clerkOrgId,
      repairConfig.customerName,
      repairConfig.contractStartDate,
      account.provider as 'MOTIVE' | 'SAMSARA'
    );

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    const units = await appPrisma.servicePlanUnit.findMany({ where: { clerkOrgId } });
    res.json({ ok: true, unitCount: units.length });
  } catch (err: any) {
    console.error('[adminOrgs] POST /:clerkOrgId/fleet/sync error:', err);
    res.status(500).json({ error: err.message ?? 'Fleet sync failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/cron-runs
// Recent persisted telematics cron summaries (Samsara / Motive daily jobs).
// ---------------------------------------------------------------------------
router.get('/cron-runs', async (req: AuthRequest, res) => {
  try {
    const appPrisma = getAppPrisma();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
    const job = req.query.job as string | undefined;

    const runs = await appPrisma.telematicsCronRun.findMany({
      where:
        job === 'SAMSARA_DAILY' || job === 'MOTIVE_DAILY'
          ? { job: job as CronJobType }
          : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const clerkOrgIds = new Set<string>();
    for (const run of runs) {
      const report = run.report as { passes?: Array<{ clerkOrgId: string }> };
      for (const p of report?.passes ?? []) {
        clerkOrgIds.add(p.clerkOrgId);
      }
    }

    const clerkOrgs = await Promise.allSettled(
      [...clerkOrgIds].map((id) => clerk.organizations.getOrganization({ organizationId: id }))
    );
    const orgNameMap = new Map<string, string>();
    [...clerkOrgIds].forEach((id, i) => {
      const r = clerkOrgs[i];
      if (r.status === 'fulfilled') orgNameMap.set(id, r.value.name);
    });

    const enriched = runs.map((run) => {
      const report = run.report as {
        passes?: Array<{
          clerkOrgId: string;
          date: string;
          verify: boolean;
          success: boolean;
          durationMs: number;
          error: string | null;
          steps: Array<{
            endpoint: string;
            newCount: number;
            updatedCount: number;
            unchangedCount: number;
            errorCount: number;
            recordCount: number;
            skipped: boolean;
            skipReason: string | null;
          }>;
        }>;
      };
      const passes = (report.passes ?? []).map((p) => ({
        ...p,
        orgName: orgNameMap.get(p.clerkOrgId) ?? p.clerkOrgId,
        steps: (p.steps ?? []).map((s) => ({
          ...s,
          apiPaths: cronStepApiPaths(run.job as CronJobType, s.endpoint),
        })),
      }));
      return {
        id: run.id,
        job: run.job,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt.toISOString(),
        durationMs: run.durationMs,
        totalOrgs: run.totalOrgs,
        successOrgs: run.successOrgs,
        failedOrgs: run.failedOrgs,
        allSucceeded: run.allSucceeded,
        report: { passes },
      };
    });

    res.json({ timestamp: new Date().toISOString(), runs: enriched });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/cron-health
// Proxy to the internal /cron/status endpoint, protected by Clerk auth.
// Only accessible to internal users.
// ---------------------------------------------------------------------------
router.get('/cron-health', async (_req: AuthRequest, res) => {
  try {
    const appPrisma = getAppPrisma();
    const accounts = await appPrisma.telematicsProviderAccount.findMany({
      select: {
        clerkOrgId: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Enrich with Clerk org names
    const clerkOrgIds = [...new Set(accounts.map(a => a.clerkOrgId))];
    const clerkOrgs = await Promise.allSettled(
      clerkOrgIds.map(id => clerk.organizations.getOrganization({ organizationId: id }))
    );
    const orgNameMap = new Map<string, string>();
    clerkOrgIds.forEach((id, i) => {
      const r = clerkOrgs[i];
      if (r.status === 'fulfilled') orgNameMap.set(id, r.value.name);
    });

    const now = Date.now();
    const enriched = accounts.map(a => {
      const lastSyncAgeHours = a.lastSyncAt != null
        ? Math.round(((now - a.lastSyncAt.getTime()) / 3600000) * 10) / 10
        : null;
      return {
        ...a,
        orgName: orgNameMap.get(a.clerkOrgId) ?? a.clerkOrgId,
        lastSyncAgeHours,
        stale: lastSyncAgeHours === null || lastSyncAgeHours > 26,
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      total: enriched.length,
      active: enriched.filter(a => a.status === 'ACTIVE').length,
      error: enriched.filter(a => a.status === 'ERROR').length,
      staleCount: enriched.filter(a => a.stale).length,
      accounts: enriched,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/whiparound/configure
// Store an encrypted Whip Around API key for a given org.
// ---------------------------------------------------------------------------
router.post('/whiparound/configure', async (req: AuthRequest, res) => {
  try {
    const { clerkOrgId, apiKey } = req.body as { clerkOrgId?: string; apiKey?: string };
    if (!clerkOrgId || !apiKey) {
      return res.status(400).json({ error: 'clerkOrgId and apiKey are required' });
    }

    // Test the key before storing
    const client = new WhiparoundClient(apiKey);
    const ok = await client.testConnection();
    if (!ok) {
      return res.status(400).json({ error: 'API key validation failed — connection test returned an error' });
    }

    const appPrisma = getAppPrisma();
    const encrypted = encryptCredentials({ apiKey });

    const account = await appPrisma.whiparoundAccount.upsert({
      where: { clerkOrgId },
      create: {
        clerkOrgId,
        credentials: encrypted,
        status: 'ACTIVE',
      },
      update: {
        credentials: encrypted,
        status: 'ACTIVE',
        lastError: null,
      },
    });

    res.json({
      success: true,
      clerkOrgId: account.clerkOrgId,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  } catch (error: any) {
    console.error('Error configuring Whip Around:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/orgs/whiparound/status
// Returns sync status for all Whip Around accounts.
// ---------------------------------------------------------------------------
router.get('/whiparound/status', async (_req: AuthRequest, res) => {
  try {
    const appPrisma = getAppPrisma();
    const accounts = await appPrisma.whiparoundAccount.findMany({
      select: {
        clerkOrgId: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = Date.now();
    const enriched = accounts.map((a) => {
      const lastSyncAgeHours =
        a.lastSyncAt != null
          ? Math.round(((now - a.lastSyncAt.getTime()) / 3_600_000) * 10) / 10
          : null;
      return {
        ...a,
        lastSyncAgeHours,
        stale: lastSyncAgeHours === null || lastSyncAgeHours > 26,
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      total: enriched.length,
      active: enriched.filter((a) => a.status === 'ACTIVE').length,
      staleCount: enriched.filter((a) => a.stale).length,
      accounts: enriched,
    });
  } catch (error: any) {
    console.error('Error fetching Whip Around status:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/orgs/whiparound/sync
// Manually trigger a Whip Around sync for a given org (no CRON_SECRET needed).
// ---------------------------------------------------------------------------
router.post('/whiparound/sync', async (req: AuthRequest, res) => {
  try {
    const { clerkOrgId, forceFullInspectionBackfill } = req.body as {
      clerkOrgId?: string;
      forceFullInspectionBackfill?: boolean;
    };
    if (!clerkOrgId) {
      return res.status(400).json({ error: 'clerkOrgId is required' });
    }

    const appPrisma = getAppPrisma();
    const account = await appPrisma.whiparoundAccount.findUnique({
      where: { clerkOrgId },
      select: { credentials: true, status: true },
    });

    if (!account) {
      return res.status(404).json({ error: 'No Whip Around account found for this org' });
    }

    const result = await syncWhiparoundOrg(clerkOrgId, account.credentials, {
      forceFullInspectionBackfill: !!forceFullInspectionBackfill,
    });

    res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    console.error('Error triggering Whip Around sync:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

export default router;
