/**
 * FETCH DRIVERS
 *
 * Endpoint: GET /fleet/drivers
 * Returns all drivers for the org. The `id` field here matches the
 * `operator.id` on idle events, so this table is what resolves the
 * operator → name lookup in the IDLE map.
 *
 * Token scope required: "Read Drivers".
 */

import { SamsaraClient } from '../client.js';

export interface SamsaraDriverApi {
  id: number | string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  externalIds?: Record<string, string>;
  driverActivationStatus?: string | null; // "active" | "deactivated"
}

export async function fetchDrivers(client: SamsaraClient): Promise<SamsaraDriverApi[]> {
  return client.get<SamsaraDriverApi>('/fleet/drivers');
}
