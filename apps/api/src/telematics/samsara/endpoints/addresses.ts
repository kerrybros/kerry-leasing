/**
 * FETCH ADDRESSES (Samsara's geofence equivalent)
 *
 * Endpoint: GET /addresses
 * Returns all addresses for the org. Each address has either a polygon
 * (vertices) or a circle (lat/lon + radiusMeters), but not both.
 *
 * Token scope required: "Read Geofences" / "Read Addresses".
 */

import { SamsaraClient } from '../client.js';

export interface SamsaraAddressApi {
  id: number | string;
  name: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence?: {
    polygon?: {
      vertices: Array<{ latitude: number; longitude: number }>;
    };
    circle?: {
      latitude?: number;
      longitude?: number;
      radiusMeters: number;
    };
  };
  notes?: string | null;
  tags?: Array<{ id: string | number; name: string }>;
  externalIds?: Record<string, string>;
}

export async function fetchAddresses(client: SamsaraClient): Promise<SamsaraAddressApi[]> {
  return client.get<SamsaraAddressApi>('/addresses');
}
