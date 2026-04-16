/**
 * WHIP AROUND SYNC SERVICE
 * Fetches inspections and defects from the Whip Around public v4 API and
 * upserts them into the App DB (WhiparoundInspection, WhiparoundDefect).
 *
 * Sync strategy:
 *  - First run (lastSyncAt === null): full backfill — no date filter, all pages.
 *  - Subsequent runs: inspections filtered by datetime_from = lastSyncAt - 1h.
 *    Defects are always fully re-synced because Whip Around updates them in-place
 *    and the v4 API has no updated_since filter for defects. Upsert handles changes.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { WhiparoundClient, WhiparoundAuthError } from './client.js';

// ---------------------------------------------------------------------------
// Raw API shapes (subset of fields we care about)
// ---------------------------------------------------------------------------

interface RawInspection {
  id: number;
  driver_id?: number | null;
  driver_name?: string | null;
  asset_id?: number | null;
  team_id?: number | null;
  form_id?: number | null;
  completion?: string | null;
  created_at?: string | null;
  inspection_ended_on_device?: string | null;
  inspection_duration_sec?: number | null;
  passed?: boolean | null;
  pdf_url?: string | null;
  [key: string]: unknown;
}

interface RawDefect {
  id: number;
  reference?: string | null;           // FA-XXXX label
  inspection_id?: number | null;
  asset?: { id?: number; name?: string } | null;
  asset_id?: number | null;
  asset_name?: string | null;
  team?: { id?: number; name?: string } | null;
  team_id?: number | null;
  team_name?: string | null;
  driver_name?: string | null;
  name?: string | null;                // defect name
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  type?: string | null;
  severity?: string | null;
  repeated_times?: number | null;
  assignee?: { name?: string } | null;
  work_order?: string | null;
  defect_source?: string | null;
  created_by?: { name?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateOrNull(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function safeInt(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && !isNaN(n) ? n : null;
}

// ---------------------------------------------------------------------------
// syncInspections
// ---------------------------------------------------------------------------

async function syncInspections(
  clerkOrgId: string,
  client: WhiparoundClient,
  lastSyncAt: Date | null
): Promise<{ synced: number; errors: number }> {
  const params: Record<string, unknown> = {};

  if (lastSyncAt) {
    // 1-hour overlap to catch any records written near the boundary
    const from = new Date(lastSyncAt.getTime() - 60 * 60 * 1000);
    params.datetime_from = from.toISOString();
  }

  let inspections: RawInspection[];
  try {
    inspections = await client.getAllCursor<RawInspection>('/inspections', params);
  } catch (err) {
    if (err instanceof WhiparoundAuthError) throw err;
    console.error(`[WhipAround] syncInspections fetch error for ${clerkOrgId}:`, err);
    return { synced: 0, errors: 1 };
  }

  const appPrisma = getAppPrisma();
  let synced = 0;
  let errors = 0;

  for (const raw of inspections) {
    try {
      const inspectedAt = toDateOrNull(raw.created_at);
      if (!inspectedAt) continue; // skip if no timestamp

      await appPrisma.whiparoundInspection.upsert({
        where: {
          clerkOrgId_whiparoundId: {
            clerkOrgId,
            whiparoundId: raw.id,
          },
        },
        create: {
          clerkOrgId,
          whiparoundId: raw.id,
          driverId: safeInt(raw.driver_id),
          driverName: raw.driver_name ?? null,
          assetId: safeInt(raw.asset_id),
          teamId: safeInt(raw.team_id),
          formId: safeInt(raw.form_id),
          completion: raw.completion ?? null,
          passed: raw.passed ?? null,
          pdfUrl: raw.pdf_url ?? null,
          durationSec: safeInt(raw.inspection_duration_sec),
          inspectedAt,
          endedOnDeviceAt: toDateOrNull(raw.inspection_ended_on_device),
          rawResponse: raw as object,
        },
        update: {
          driverId: safeInt(raw.driver_id),
          driverName: raw.driver_name ?? null,
          assetId: safeInt(raw.asset_id),
          teamId: safeInt(raw.team_id),
          formId: safeInt(raw.form_id),
          completion: raw.completion ?? null,
          passed: raw.passed ?? null,
          pdfUrl: raw.pdf_url ?? null,
          durationSec: safeInt(raw.inspection_duration_sec),
          inspectedAt,
          endedOnDeviceAt: toDateOrNull(raw.inspection_ended_on_device),
          rawResponse: raw as object,
        },
      });
      synced++;
    } catch (err) {
      console.error(`[WhipAround] upsert inspection ${raw.id} error:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

// ---------------------------------------------------------------------------
// syncDefects
// ---------------------------------------------------------------------------

async function syncDefects(
  clerkOrgId: string,
  client: WhiparoundClient
): Promise<{ synced: number; errors: number }> {
  let defects: RawDefect[];
  try {
    defects = await client.getAllClassic<RawDefect>('/defects', {
      'include[]': 'asset',
    });
  } catch (err) {
    if (err instanceof WhiparoundAuthError) throw err;
    console.error(`[WhipAround] syncDefects fetch error for ${clerkOrgId}:`, err);
    return { synced: 0, errors: 1 };
  }

  const appPrisma = getAppPrisma();
  let synced = 0;
  let errors = 0;

  for (const raw of defects) {
    try {
      // Resolve nested includes
      const assetId = safeInt(raw.asset?.id ?? raw.asset_id);
      const assetName: string | null = raw.asset?.name ?? raw.asset_name ?? null;
      const teamId = safeInt(raw.team?.id ?? raw.team_id);
      const teamName: string | null = raw.team?.name ?? raw.team_name ?? null;
      const assignee: string | null =
        typeof raw.assignee === 'object' && raw.assignee !== null
          ? (raw.assignee as { name?: string }).name ?? null
          : typeof raw.assignee === 'string'
          ? raw.assignee
          : null;
      const createdBy: string | null =
        typeof raw.created_by === 'object' && raw.created_by !== null
          ? (raw.created_by as { name?: string }).name ?? null
          : typeof raw.created_by === 'string'
          ? raw.created_by
          : null;

      const data = {
        defectRef: raw.reference ?? null,
        inspectionId: safeInt(raw.inspection_id),
        assetId,
        assetName,
        teamId,
        teamName,
        driverName: raw.driver_name ?? null,
        defectName: raw.name ?? null,
        description: raw.description ?? null,
        status: raw.status ?? null,
        defectPriority: raw.priority ?? null,
        defectType: raw.type ?? null,
        severity: raw.severity ?? null,
        repeatedTimes: safeInt(raw.repeated_times),
        assignee,
        workOrder: raw.work_order ?? null,
        defectSource: raw.defect_source ?? null,
        createdBy,
        defectCreatedAt: toDateOrNull(raw.created_at),
        defectUpdatedAt: toDateOrNull(raw.updated_at),
        rawResponse: raw as object,
      };

      await appPrisma.whiparoundDefect.upsert({
        where: {
          clerkOrgId_whiparoundId: { clerkOrgId, whiparoundId: raw.id },
        },
        create: { clerkOrgId, whiparoundId: raw.id, ...data },
        update: data,
      });
      synced++;
    } catch (err) {
      console.error(`[WhipAround] upsert defect ${raw.id} error:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

// ---------------------------------------------------------------------------
// syncWhiparoundOrg
// ---------------------------------------------------------------------------

export interface OrgSyncResult {
  clerkOrgId: string;
  success: boolean;
  inspectionsSynced: number;
  defectsSynced: number;
  errors: number;
  durationMs: number;
  error?: string;
}

export async function syncWhiparoundOrg(
  clerkOrgId: string,
  credentialsJson: unknown
): Promise<OrgSyncResult> {
  const t0 = Date.now();

  let creds: Record<string, unknown>;
  try {
    creds = readCredentials(credentialsJson);
  } catch (err: any) {
    return {
      clerkOrgId,
      success: false,
      inspectionsSynced: 0,
      defectsSynced: 0,
      errors: 1,
      durationMs: Date.now() - t0,
      error: `Credential error: ${err.message}`,
    };
  }

  const apiKey = creds.apiKey as string;
  if (!apiKey) {
    return {
      clerkOrgId,
      success: false,
      inspectionsSynced: 0,
      defectsSynced: 0,
      errors: 1,
      durationMs: Date.now() - t0,
      error: 'Missing apiKey in stored credentials',
    };
  }

  const appPrisma = getAppPrisma();
  const account = await appPrisma.whiparoundAccount.findUnique({
    where: { clerkOrgId },
    select: { lastSyncAt: true },
  });

  const client = new WhiparoundClient(apiKey);

  try {
    const [inspResult, defResult] = await Promise.all([
      syncInspections(clerkOrgId, client, account?.lastSyncAt ?? null),
      syncDefects(clerkOrgId, client),
    ]);

    const totalErrors = inspResult.errors + defResult.errors;

    await appPrisma.whiparoundAccount.update({
      where: { clerkOrgId },
      data: {
        lastSyncAt: new Date(),
        lastError: totalErrors > 0 ? `${totalErrors} upsert error(s)` : null,
        status: 'ACTIVE',
      },
    });

    return {
      clerkOrgId,
      success: true,
      inspectionsSynced: inspResult.synced,
      defectsSynced: defResult.synced,
      errors: totalErrors,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);

    await appPrisma.whiparoundAccount.update({
      where: { clerkOrgId },
      data: { lastError: msg },
    }).catch(() => {});

    return {
      clerkOrgId,
      success: false,
      inspectionsSynced: 0,
      defectsSynced: 0,
      errors: 1,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ---------------------------------------------------------------------------
// syncWhiparoundDaily
// ---------------------------------------------------------------------------

export interface DailySyncResult {
  totalOrgs: number;
  successCount: number;
  errorCount: number;
  duration: number;
  results: OrgSyncResult[];
}

export async function syncWhiparoundDaily(): Promise<DailySyncResult> {
  const t0 = Date.now();
  const appPrisma = getAppPrisma();

  const accounts = await appPrisma.whiparoundAccount.findMany({
    where: { status: 'ACTIVE' },
    select: { clerkOrgId: true, credentials: true },
  });

  console.log(`[WhipAround] Daily sync: ${accounts.length} active org(s)`);

  const results: OrgSyncResult[] = [];

  for (const acct of accounts) {
    console.log(`[WhipAround] Syncing org ${acct.clerkOrgId}…`);
    const result = await syncWhiparoundOrg(acct.clerkOrgId, acct.credentials);
    results.push(result);

    if (result.success) {
      console.log(
        `[WhipAround] ✓ ${acct.clerkOrgId}: ` +
          `${result.inspectionsSynced} inspections, ` +
          `${result.defectsSynced} defects (${result.durationMs}ms)`
      );
    } else {
      console.error(
        `[WhipAround] ✗ ${acct.clerkOrgId}: ${result.error}`
      );
    }
  }

  return {
    totalOrgs: accounts.length,
    successCount: results.filter((r) => r.success).length,
    errorCount: results.filter((r) => !r.success).length,
    duration: Date.now() - t0,
    results,
  };
}
