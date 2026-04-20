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

/** Whip Around rejects subsecond precision in query datetimes (must end with Z or ±offset). */
function toWhiparoundDatetimeParam(d: Date): string {
  const iso = d.toISOString();
  return iso.includes('.') ? `${iso.slice(0, iso.indexOf('.'))}Z` : iso;
}

function safeInt(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && !isNaN(n) ? n : null;
}

/** Postgres rejects NUL in text; API may return objects for some string-ish fields. */
function textField(val: unknown): string | null {
  if (val == null) return null;
  let s: string;
  if (typeof val === 'string') s = val;
  else if (typeof val === 'number' || typeof val === 'boolean') s = String(val);
  else s = JSON.stringify(val);
  s = s.replace(/\0/g, '').trim();
  return s.length ? s : null;
}

/** Ensure JSONB write always succeeds (BigInt, circular refs, etc.). */
function jsonSafeForDb(raw: object): object {
  try {
    return JSON.parse(
      JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    ) as object;
  } catch {
    return { _serializationFailed: true };
  }
}

// ---------------------------------------------------------------------------
// syncInspections
// ---------------------------------------------------------------------------

async function syncInspections(
  clerkOrgId: string,
  client: WhiparoundClient,
  lastSyncAt: Date | null
): Promise<{ synced: number; errors: number; firstUpsertError?: string }> {
  const params: Record<string, unknown> = {};

  if (lastSyncAt) {
    // 1-hour overlap to catch any records written near the boundary
    const from = new Date(lastSyncAt.getTime() - 60 * 60 * 1000);
    params.datetime_from = toWhiparoundDatetimeParam(from);
  }

  let inspections: RawInspection[];
  try {
    inspections = await client.getAllCursor<RawInspection>('/inspections', params);
  } catch (err) {
    if (err instanceof WhiparoundAuthError) throw err;
    console.error(`[WhipAround] syncInspections fetch error for ${clerkOrgId}:`, err);
    return { synced: 0, errors: 1, firstUpsertError: err instanceof Error ? err.message : String(err) };
  }

  const appPrisma = getAppPrisma();
  let synced = 0;
  let errors = 0;
  let firstUpsertError: string | undefined;

  for (const raw of inspections) {
    try {
      const whiparoundId = safeInt(raw.id);
      if (whiparoundId == null) {
        if (!firstUpsertError) firstUpsertError = 'Inspection missing numeric id';
        errors++;
        continue;
      }

      const inspectedAt = toDateOrNull(raw.created_at);
      if (!inspectedAt) continue; // skip if no timestamp

      const rawResponse = jsonSafeForDb(raw as object);

      await appPrisma.whiparoundInspection.upsert({
        where: {
          clerkOrgId_whiparoundId: {
            clerkOrgId,
            whiparoundId,
          },
        },
        create: {
          clerkOrgId,
          whiparoundId,
          driverId: safeInt(raw.driver_id),
          driverName: textField(raw.driver_name),
          assetId: safeInt(raw.asset_id),
          teamId: safeInt(raw.team_id),
          formId: safeInt(raw.form_id),
          completion: textField(raw.completion),
          passed: raw.passed ?? null,
          pdfUrl: textField(raw.pdf_url),
          durationSec: safeInt(raw.inspection_duration_sec),
          inspectedAt,
          endedOnDeviceAt: toDateOrNull(raw.inspection_ended_on_device),
          rawResponse,
        },
        update: {
          driverId: safeInt(raw.driver_id),
          driverName: textField(raw.driver_name),
          assetId: safeInt(raw.asset_id),
          teamId: safeInt(raw.team_id),
          formId: safeInt(raw.form_id),
          completion: textField(raw.completion),
          passed: raw.passed ?? null,
          pdfUrl: textField(raw.pdf_url),
          durationSec: safeInt(raw.inspection_duration_sec),
          inspectedAt,
          endedOnDeviceAt: toDateOrNull(raw.inspection_ended_on_device),
          rawResponse,
        },
      });
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!firstUpsertError) firstUpsertError = msg;
      console.error(`[WhipAround] upsert inspection ${String(raw.id)} error:`, err);
      errors++;
    }
  }

  return { synced, errors, firstUpsertError };
}

// ---------------------------------------------------------------------------
// syncDefects
// ---------------------------------------------------------------------------

async function syncDefects(
  clerkOrgId: string,
  client: WhiparoundClient
): Promise<{ synced: number; errors: number; firstUpsertError?: string }> {
  let defects: RawDefect[];
  try {
    defects = await client.getAllClassic<RawDefect>('/defects', {
      'include[]': 'asset',
    });
  } catch (err) {
    if (err instanceof WhiparoundAuthError) throw err;
    console.error(`[WhipAround] syncDefects fetch error for ${clerkOrgId}:`, err);
    return { synced: 0, errors: 1, firstUpsertError: err instanceof Error ? err.message : String(err) };
  }

  const appPrisma = getAppPrisma();
  let synced = 0;
  let errors = 0;
  let firstUpsertError: string | undefined;

  for (const raw of defects) {
    try {
      const whiparoundId = safeInt(raw.id);
      if (whiparoundId == null) {
        if (!firstUpsertError) firstUpsertError = 'Defect missing numeric id';
        errors++;
        continue;
      }

      // Resolve nested includes
      const assetId = safeInt(raw.asset?.id ?? raw.asset_id);
      const assetName = textField(raw.asset?.name ?? raw.asset_name);
      const teamId = safeInt(raw.team?.id ?? raw.team_id);
      const teamName = textField(raw.team?.name ?? raw.team_name);
      const assignee =
        typeof raw.assignee === 'object' && raw.assignee !== null
          ? textField((raw.assignee as { name?: string }).name)
          : textField(raw.assignee as unknown);
      const createdBy =
        typeof raw.created_by === 'object' && raw.created_by !== null
          ? textField((raw.created_by as { name?: string }).name)
          : textField(raw.created_by as unknown);

      const rawResponse = jsonSafeForDb(raw as object);

      const data = {
        defectRef: textField(raw.reference),
        inspectionId: safeInt(raw.inspection_id),
        assetId,
        assetName,
        teamId,
        teamName,
        driverName: textField(raw.driver_name),
        defectName: textField(raw.name),
        description: textField(raw.description),
        status: textField(raw.status)?.toLowerCase().replace(/[\s-]+/g, '_') ?? null,
        defectPriority: textField(raw.priority),
        defectType: textField(raw.type),
        severity: textField(raw.severity),
        repeatedTimes: safeInt(raw.repeated_times),
        assignee,
        workOrder: textField(raw.work_order),
        defectSource: textField(raw.defect_source),
        createdBy,
        defectCreatedAt: toDateOrNull(raw.created_at),
        defectUpdatedAt: toDateOrNull(raw.updated_at),
        rawResponse,
      };

      await appPrisma.whiparoundDefect.upsert({
        where: {
          clerkOrgId_whiparoundId: { clerkOrgId, whiparoundId },
        },
        create: { clerkOrgId, whiparoundId, ...data },
        update: data,
      });
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!firstUpsertError) firstUpsertError = msg;
      console.error(`[WhipAround] upsert defect ${String(raw.id)} error:`, err);
      errors++;
    }
  }

  return { synced, errors, firstUpsertError };
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
  /** First Prisma/API upsert failure message (when errors > 0). */
  upsertErrorDetail?: string;
}

export async function syncWhiparoundOrg(
  clerkOrgId: string,
  credentialsJson: unknown,
  options?: { forceFullInspectionBackfill?: boolean }
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

  const inspectionSyncFrom: Date | null =
    options?.forceFullInspectionBackfill ? null : (account?.lastSyncAt ?? null);

  try {
    const [inspResult, defResult] = await Promise.all([
      syncInspections(clerkOrgId, client, inspectionSyncFrom),
      syncDefects(clerkOrgId, client),
    ]);

    const totalErrors = inspResult.errors + defResult.errors;

    const upsertHints = [inspResult.firstUpsertError, defResult.firstUpsertError].filter(
      Boolean
    ) as string[];
    const lastErrorMsg =
      totalErrors > 0
        ? upsertHints.length
          ? `${totalErrors} upsert error(s): ${upsertHints.join(' | ')}`
          : `${totalErrors} upsert error(s)`
        : null;

    await appPrisma.whiparoundAccount.update({
      where: { clerkOrgId },
      data: {
        lastSyncAt: new Date(),
        lastError: lastErrorMsg,
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
      upsertErrorDetail:
        totalErrors > 0 ? upsertHints.join(' | ') || undefined : undefined,
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
