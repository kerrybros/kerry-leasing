/**
 * WHIPAROUND DRIVER SYNC
 *
 * Pulls /drivers for an org and reconciles into DriverContact:
 *  - Filters out is_admin and on_hold drivers
 *  - Match priority: existing whiparoundDriverId → email → normalized name → create new
 *  - Phone overwrite rules:
 *      MANUAL contacts        → never touch phoneE164 (admin authoritative)
 *      MOTIVE_AUTO contacts   → upgrade phoneE164 + email + whiparoundDriverId from WP
 *      WHIPAROUND_SYNC rows   → keep in sync with latest WP values
 *
 * Returns a per-step summary in the same shape used by inspection/defect sync
 * so it slots into the existing Whiparound daily cron.
 */

import { parsePhoneNumber } from 'libphonenumber-js';
import { getAppPrisma } from '../../lib/prisma.js';
import { DriverContactSource } from '../../generated/app-client/index.js';
import { WhiparoundClient } from './client.js';
import { dedupContactsByEmail } from './dedupContactsByEmail.js';

interface RawDriver {
  id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  mobile_phone?: string | null;
  username?: string | null;
  on_hold?: boolean | null;
  is_admin?: boolean | null;
  team_name?: string | null;
  [k: string]: unknown;
}

export interface DriverSyncStepResult {
  endpoint: 'drivers';
  date: string;
  recordCount: number;          // total WP drivers (after filter)
  newCount: number;             // new DriverContact rows created
  updatedCount: number;         // existing rows refreshed
  unchangedCount: number;       // skipped (admin/on_hold/manual-locked)
  errorCount: number;
  skipped: boolean;
  skipReason?: string;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = parsePhoneNumber(raw, 'US');
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

function displayNameOf(d: RawDriver): string {
  if (d.name) return d.name.trim();
  const composed = `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim();
  if (composed) return composed;
  return d.username?.trim() ?? `Whiparound ${d.id}`;
}

function shouldSkip(d: RawDriver): { skip: true; reason: string } | { skip: false } {
  if (d.is_admin === true) return { skip: true, reason: 'is_admin' };
  if (d.on_hold === true) return { skip: true, reason: 'on_hold' };
  if (d.id == null) return { skip: true, reason: 'missing_id' };
  return { skip: false };
}

export async function syncWhiparoundDrivers(
  clerkOrgId: string,
  client: WhiparoundClient
): Promise<DriverSyncStepResult> {
  const prisma = getAppPrisma();
  const today = new Date().toISOString().slice(0, 10);

  let rawDrivers: RawDriver[];
  try {
    // Whiparound /drivers uses cursor pagination in our captured docs.
    rawDrivers = await client.getAllCursor<RawDriver>('/drivers');
  } catch (err: any) {
    try {
      rawDrivers = await client.getAllClassic<RawDriver>('/drivers');
    } catch (inner: any) {
      console.warn(`[Whiparound] syncDrivers failed for ${clerkOrgId}: ${inner.message}`);
      return {
        endpoint: 'drivers', date: today,
        recordCount: 0, newCount: 0, updatedCount: 0, unchangedCount: 0, errorCount: 1,
        skipped: true, skipReason: inner.message,
      };
    }
  }

  // Load all org contacts once for in-memory matching
  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId },
    select: {
      id: true, displayName: true, normalizedName: true, email: true, phoneE164: true,
      motiveDriverId: true, whiparoundDriverId: true, source: true,
    },
  });
  const byWpId = new Map(contacts.filter((c) => c.whiparoundDriverId != null).map((c) => [c.whiparoundDriverId!, c]));
  const byEmail = new Map(contacts.filter((c) => c.email != null).map((c) => [c.email!, c]));
  const byName = new Map(contacts.map((c) => [c.normalizedName, c]));

  // Motive driver index for cross-system matching. Primary source is the
  // MotiveDriverMaster table (full roster from /v1/users, including drivers
  // who haven't driven). Falls back to MotiveDriverUtilization for any
  // driver who somehow isn't in the master yet — covers the gap before
  // first master sync completes.
  const masterRows = await prisma.motiveDriverMaster.findMany({
    where: { clerkOrgId },
    select: { motiveDriverId: true, firstName: true, lastName: true, email: true },
  });
  const utilFallbackRows = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId, driverId: { not: null } },
    select: { driverId: true, driverFirstName: true, driverLastName: true, driverEmail: true },
    distinct: ['driverId'],
  });

  const motiveByEmail = new Map<string, number>();
  const motiveByName = new Map<string, number>();
  // Master entries take priority — populate first.
  for (const m of masterRows) {
    const em = m.email?.trim().toLowerCase();
    if (em && !motiveByEmail.has(em)) motiveByEmail.set(em, m.motiveDriverId);
    const fullName = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
    if (fullName) {
      const norm = normalizeName(fullName);
      if (!motiveByName.has(norm)) motiveByName.set(norm, m.motiveDriverId);
    }
  }
  // Fallback: utilization-derived rows fill any holes.
  for (const m of utilFallbackRows) {
    if (m.driverId == null) continue;
    const em = m.driverEmail?.trim().toLowerCase();
    if (em && !motiveByEmail.has(em)) motiveByEmail.set(em, m.driverId);
    const fullName = `${m.driverFirstName ?? ''} ${m.driverLastName ?? ''}`.trim();
    if (fullName) {
      const norm = normalizeName(fullName);
      if (!motiveByName.has(norm)) motiveByName.set(norm, m.driverId);
    }
  }

  /** Find motiveDriverId from history for a given WP driver. Email > name. */
  function lookupMotiveDriverId(email: string | null, normalizedDisplayName: string): number | null {
    if (email && motiveByEmail.has(email)) return motiveByEmail.get(email)!;
    if (motiveByName.has(normalizedDisplayName)) return motiveByName.get(normalizedDisplayName)!;
    return null;
  }

  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;

  for (const d of rawDrivers) {
    const skip = shouldSkip(d);
    if (skip.skip) { unchangedCount++; continue; }

    const wpId = d.id!;
    const email = normalizeEmail(d.email ?? null);
    const phoneE164 = normalizePhone(d.mobile_phone ?? null);
    const displayName = displayNameOf(d);
    const normalizedName = normalizeName(displayName);

    // Match priority: existing whiparoundDriverId → email → name
    let existing =
      byWpId.get(wpId) ||
      (email ? byEmail.get(email) : undefined) ||
      byName.get(normalizedName);

    try {
      if (existing) {
        // Phone update is gated by source.
        const allowPhoneUpdate = existing.source !== DriverContactSource.MANUAL;
        const patch: Record<string, unknown> = {};

        if (existing.whiparoundDriverId !== wpId) patch.whiparoundDriverId = wpId;
        if (email && existing.email !== email) patch.email = email;
        if (phoneE164 && allowPhoneUpdate && existing.phoneE164 !== phoneE164) patch.phoneE164 = phoneE164;
        // Attach motiveDriverId from the historical Motive index if the
        // existing row doesn't have one yet. This catches drivers who are
        // in Motive but didn't drive in the last 7 days (so the builder's
        // scorecard-based reconciliation missed them).
        if (existing.motiveDriverId == null) {
          const motiveId = lookupMotiveDriverId(email, normalizedName);
          if (motiveId != null) patch.motiveDriverId = motiveId;
        }
        // If this row was lazily created from Motive name reconciliation but
        // Whiparound also confirms a match, mark it as cross-system-confirmed.
        // We keep MOTIVE_AUTO as the source unless Whiparound is now the
        // primary identifier (no motive id but yes WP id).
        if (existing.source === DriverContactSource.MOTIVE_AUTO && existing.motiveDriverId == null) {
          patch.source = DriverContactSource.WHIPAROUND_SYNC;
        }

        if (Object.keys(patch).length === 0) {
          unchangedCount++;
        } else {
          try {
            await prisma.driverContact.update({ where: { id: existing.id }, data: patch });
            updatedCount++;
          } catch (innerErr: any) {
            // Phone unique conflict almost always means another row in this
            // org already owns this phone (likely a duplicate the admin needs
            // to merge). Retry without the phone so we still set the WP id
            // and email — admin can resolve the duplicate phone afterwards.
            if (innerErr.code === 'P2002' && Array.isArray(innerErr.meta?.target) &&
                (innerErr.meta.target as string[]).includes('phone_e164')) {
              const { phoneE164: _drop, ...patchWithoutPhone } = patch;
              await prisma.driverContact.update({ where: { id: existing.id }, data: patchWithoutPhone });
              console.warn(
                `[Whiparound syncDrivers] phone conflict for wpId=${wpId} ${displayName} — ` +
                `applied other fields, left phone for admin merge`,
              );
              updatedCount++;
            } else {
              throw innerErr;
            }
          }
        }
      } else {
        // Create new row sourced from Whiparound. If phone collides with an
        // existing row, fall back to creating without phone (admin will merge).
        const motiveDriverId = lookupMotiveDriverId(email, normalizedName);
        try {
          await prisma.driverContact.create({
            data: {
              clerkOrgId,
              displayName,
              normalizedName,
              email,
              phoneE164,
              whiparoundDriverId: wpId,
              motiveDriverId,
              source: DriverContactSource.WHIPAROUND_SYNC,
              enrolled: true,
              optedOut: false,
            },
          });
          newCount++;
        } catch (innerErr: any) {
          if (innerErr.code === 'P2002' && Array.isArray(innerErr.meta?.target) &&
              (innerErr.meta.target as string[]).includes('phone_e164')) {
            await prisma.driverContact.create({
              data: {
                clerkOrgId,
                displayName,
                normalizedName,
                email,
                whiparoundDriverId: wpId,
                motiveDriverId,
                source: DriverContactSource.WHIPAROUND_SYNC,
                enrolled: true,
                optedOut: false,
              },
            });
            console.warn(
              `[Whiparound syncDrivers] phone conflict for new wpId=${wpId} ${displayName} — created without phone`,
            );
            newCount++;
          } else {
            throw innerErr;
          }
        }
      }
    } catch (err: any) {
      // Unique-constraint races (e.g. same normalizedName via case-collision) → log + continue
      console.warn(`[Whiparound syncDrivers] upsert error for wpId=${wpId} ${displayName}: ${err.message}`);
      errorCount++;
    }
  }

  // Self-healing pass: any DriverContact rows in this org sharing an email
  // get merged into one. Catches the case where WP sync created a new row
  // before the corresponding Motive-side row had email populated.
  try {
    const dedup = await dedupContactsByEmail(clerkOrgId);
    if (dedup.rowsMerged > 0 || dedup.errors > 0) {
      console.log(
        `[Whiparound dedup] org=${clerkOrgId} duplicateGroups=${dedup.duplicateGroups} rowsMerged=${dedup.rowsMerged} errors=${dedup.errors}`,
      );
    }
    errorCount += dedup.errors;
  } catch (err: any) {
    console.warn(`[Whiparound dedup] failed for ${clerkOrgId}: ${err.message}`);
  }

  return {
    endpoint: 'drivers',
    date: today,
    recordCount: rawDrivers.length,
    newCount,
    updatedCount,
    unchangedCount,
    errorCount,
    skipped: false,
  };
}
