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
  /** Numbers moved from a departed driver to the active one holding them now. */
  phoneReassignments?: Array<{ phoneLast4: string; from: string; to: string }>;
  /** Numbers two current-looking drivers both claim. These need a human. */
  phoneConflicts?: Array<{ phoneLast4: string; heldBy: string; wanted: string }>;
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
    select: { motiveDriverId: true, firstName: true, lastName: true, email: true, status: true },
  });
  // Motive's employment status per driver, used to settle phone-number
  // collisions: a number belongs to whoever is still driving.
  const motiveStatusById = new Map<number, string>();
  for (const m of masterRows) motiveStatusById.set(m.motiveDriverId, (m.status ?? '').toLowerCase());
  const isActiveInMotive = (motiveDriverId: number | null | undefined): boolean =>
    motiveDriverId != null && motiveStatusById.get(motiveDriverId) === 'active';
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
  // Phone numbers moved from a departed driver to the active one, and numbers
  // two current-looking drivers both claim. The second kind needs a human, so
  // it travels back in the sync result rather than dying in a log line.
  const phoneReassignments: Array<{ phoneLast4: string; from: string; to: string }> = [];
  const phoneConflicts: Array<{ phoneLast4: string; heldBy: string; wanted: string }> = [];

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
              // Another contact in this org already holds this number.
              //
              // The usual cause is a departed driver whose Whiparound record was
              // never cleaned up, still carrying a number the company has since
              // reissued to someone new. Motive settles it: it drops the phone
              // from a driver who leaves and puts it on the active one. So when
              // the current holder is NOT active in Motive and the incoming
              // driver IS, the number has moved and we move it too.
              //
              // Anything else (both active, neither known) is a real ambiguity
              // that a human has to resolve, so the phone is left alone and the
              // conflict is reported rather than guessed at.
              const holder = await prisma.driverContact.findFirst({
                where: { clerkOrgId, phoneE164: phoneE164! },
                select: { id: true, displayName: true, motiveDriverId: true },
              });
              const incomingMotiveId = (patch.motiveDriverId as number | undefined) ?? existing.motiveDriverId;
              const reassign =
                holder != null &&
                holder.id !== existing.id &&
                !isActiveInMotive(holder.motiveDriverId) &&
                isActiveInMotive(incomingMotiveId);

              if (reassign) {
                await prisma.driverContact.update({ where: { id: holder!.id }, data: { phoneE164: null } });
                await prisma.driverContact.update({ where: { id: existing.id }, data: patch });
                phoneReassignments.push({ phoneLast4: phoneE164!.slice(-4), from: holder!.displayName, to: displayName });
                console.log(
                  `[Whiparound syncDrivers] phone ...${phoneE164!.slice(-4)} moved from ${holder!.displayName} ` +
                  `(inactive in Motive) to ${displayName} (active)`,
                );
              } else {
                const { phoneE164: _drop, ...patchWithoutPhone } = patch;
                await prisma.driverContact.update({ where: { id: existing.id }, data: patchWithoutPhone });
                phoneConflicts.push({ phoneLast4: phoneE164!.slice(-4), heldBy: holder?.displayName ?? 'unknown', wanted: displayName });
                console.warn(
                  `[Whiparound syncDrivers] phone conflict for wpId=${wpId} ${displayName}: ` +
                  `...${phoneE164!.slice(-4)} is held by ${holder?.displayName ?? 'another contact'} and both look current. ` +
                  `Applied other fields; a human needs to resolve this one.`,
                );
              }
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

  // Whiparound returns drivers in its own order, so a number can look contested
  // when an earlier, departed claimant is processed before the active driver who
  // actually holds it now. Once the number has been reassigned, the earlier
  // complaint is answered; reporting it would send someone chasing a resolved
  // problem.
  const reassignedNumbers = new Set(phoneReassignments.map((r) => r.phoneLast4));
  const unresolvedConflicts = phoneConflicts.filter((c) => !reassignedNumbers.has(c.phoneLast4));

  if (phoneReassignments.length > 0) {
    console.log(`[Whiparound syncDrivers] reassigned ${phoneReassignments.length} recycled phone number(s)`);
  }
  if (unresolvedConflicts.length > 0) {
    console.warn(`[Whiparound syncDrivers] ${unresolvedConflicts.length} phone conflict(s) need a human decision`);
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
    phoneReassignments,
    phoneConflicts: unresolvedConflicts,
  };
}
