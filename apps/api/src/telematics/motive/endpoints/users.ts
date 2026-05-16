/**
 * USERS ENDPOINT
 * Fetches the full Motive user roster (drivers, admins, etc.) — used as the
 * authoritative driver index for cross-system matching. Unlike activity-based
 * endpoints, /v1/users returns every user regardless of whether they've
 * driven a vehicle, so dormant drivers still show up here.
 */

import { MotiveClient } from '../client.js';

/** Subset of fields we care about. Motive returns more — preserved in rawResponse. */
export interface MotiveUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;       // typically "driver", "admin", "fleet_admin", etc.
  status?: string | null;     // "active" | "inactive"
  [key: string]: unknown;
}

export async function fetchMotiveUsers(client: MotiveClient): Promise<MotiveUser[]> {
  try {
    const results = await client.get<MotiveUser>('/v1/users');
    console.log(`✓ Fetched ${results.length} Motive users`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch Motive users:`, error);
    throw error;
  }
}
