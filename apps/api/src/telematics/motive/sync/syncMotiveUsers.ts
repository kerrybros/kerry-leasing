/**
 * SYNC MOTIVE USERS — full driver roster upsert.
 *
 * Pulls /v1/users for the org, filters to drivers, and upserts into
 * MotiveDriverMaster. This gives us the authoritative driver index for
 * matching against Whiparound — even for drivers who haven't driven
 * recently (or ever) and so don't show up in activity-based endpoints.
 *
 * Runs once per daily Motive sync. Idempotent — re-runs just refresh
 * fields like phone/email/status.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchMotiveUsers, type MotiveUser } from '../endpoints/users.js';
import { SyncResult } from '../types.js';

function isDriverRole(role: string | null | undefined): boolean {
  if (!role) return true; // No role => assume driver; safer to over-include than miss someone
  return role.toLowerCase().includes('driver');
}

export async function syncMotiveUsers(
  clerkOrgId: string,
  apiKey: string,
  date: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'users',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new MotiveClient(apiKey);
  const users = await fetchMotiveUsers(client);

  const drivers = users.filter((u) => isDriverRole(u.role));
  result.recordCount = drivers.length;

  const now = new Date();

  for (const u of drivers) {
    try {
      const existing = await appPrisma.motiveDriverMaster.findUnique({
        where: { clerkOrgId_motiveDriverId: { clerkOrgId, motiveDriverId: u.id } },
      });

      const data = {
        clerkOrgId,
        motiveDriverId: u.id,
        firstName: u.first_name ?? null,
        lastName: u.last_name ?? null,
        username: u.username ?? null,
        email: u.email?.trim().toLowerCase() || null,
        phone: u.phone ?? null,
        role: u.role ?? null,
        status: u.status ?? null,
        rawResponse: u as object,
        lastSyncedAt: now,
      };

      if (!existing) {
        await appPrisma.motiveDriverMaster.create({ data });
        result.newCount++;
      } else {
        const changed =
          existing.firstName !== data.firstName ||
          existing.lastName !== data.lastName ||
          existing.username !== data.username ||
          existing.email !== data.email ||
          existing.phone !== data.phone ||
          existing.role !== data.role ||
          existing.status !== data.status;
        if (changed) {
          await appPrisma.motiveDriverMaster.update({
            where: { clerkOrgId_motiveDriverId: { clerkOrgId, motiveDriverId: u.id } },
            data,
          });
          result.updatedCount++;
        } else {
          // Always refresh lastSyncedAt so stale rows are obvious
          await appPrisma.motiveDriverMaster.update({
            where: { clerkOrgId_motiveDriverId: { clerkOrgId, motiveDriverId: u.id } },
            data: { lastSyncedAt: now },
          });
          result.unchangedCount++;
        }
      }
    } catch (err: any) {
      result.errorCount++;
      result.errors.push({ recordId: String(u.id), error: err.message ?? String(err) });
    }
  }

  return result;
}
