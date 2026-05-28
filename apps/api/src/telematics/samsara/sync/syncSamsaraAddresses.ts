/**
 * SYNC SAMSARA ADDRESSES (geofence equivalent)
 *
 * Writes to samsara_addresses. Circles are converted to 32-vertex polygons
 * at sync time so the IDLE map can consume both Motive and Samsara geofences
 * through one polygon-only path on the frontend.
 *
 * No date params — this is configuration data; sync less often than daily.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { fetchAddresses, SamsaraAddressApi } from '../endpoints/addresses.js';
import { SyncResult } from '../types.js';

const CIRCLE_VERTEX_COUNT = 32;
const METERS_PER_DEGREE_LAT = 111320;

/**
 * Approximate a circle as a regular N-gon, returning vertices as {lat, lon}.
 * Closes the ring (last vertex == first vertex), matching Motive's polygon convention.
 */
function circleToPolygon(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  vertices: number = CIRCLE_VERTEX_COUNT
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  for (let i = 0; i < vertices; i++) {
    const angle = (i * 2 * Math.PI) / vertices;
    const dLat = (radiusMeters / METERS_PER_DEGREE_LAT) * Math.cos(angle);
    const dLon =
      (radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(cosLat, 1e-6))) * Math.sin(angle);
    points.push({ lat: centerLat + dLat, lon: centerLon + dLon });
  }
  if (points.length > 0) points.push(points[0]!);
  return points;
}

function normalizeAddress(addr: SamsaraAddressApi): {
  geofenceType: 'polygon' | 'circle';
  locationPoints: Array<{ lat: number; lon: number }>;
  circle: { lat: number | null; lon: number | null; radiusMeters: number | null };
} | null {
  const polygon = addr.geofence?.polygon;
  const circle = addr.geofence?.circle;

  if (polygon?.vertices?.length) {
    const points = polygon.vertices.map(v => ({ lat: v.latitude, lon: v.longitude }));
    // Close ring if needed
    if (points.length >= 3) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      if (first.lat !== last.lat || first.lon !== last.lon) points.push(first);
    }
    return {
      geofenceType: 'polygon',
      locationPoints: points,
      circle: { lat: null, lon: null, radiusMeters: null },
    };
  }

  if (circle?.radiusMeters != null) {
    // Circles may omit lat/lon while geocoding is still pending; fall back to top-level address lat/lon.
    const lat = circle.latitude ?? addr.latitude ?? null;
    const lon = circle.longitude ?? addr.longitude ?? null;
    if (lat == null || lon == null) return null;
    return {
      geofenceType: 'circle',
      locationPoints: circleToPolygon(lat, lon, circle.radiusMeters),
      circle: { lat, lon, radiusMeters: circle.radiusMeters },
    };
  }

  return null;
}

export async function syncSamsaraAddresses(
  clerkOrgId: string,
  apiToken: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'addresses',
    date: 'N/A',
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);
  console.log(`[Samsara] Starting addresses sync for org ${clerkOrgId}`);

  try {
    const addresses = await fetchAddresses(client);
    result.recordCount = addresses.length;

    for (const addr of addresses) {
      try {
        const samsaraAddressId = String(addr.id);
        const normalized = normalizeAddress(addr);

        if (!normalized) {
          // No usable geometry — skip; map can't render it anyway.
          result.errorCount++;
          result.errors.push({
            recordId: samsaraAddressId,
            error: 'Address has no usable polygon or circle geometry',
          });
          continue;
        }

        const data = {
          name: addr.name,
          formattedAddress: addr.formattedAddress ?? null,
          geofenceType: normalized.geofenceType,
          locationPoints: normalized.locationPoints as any,
          circleLat: normalized.circle.lat,
          circleLon: normalized.circle.lon,
          circleRadiusMeters: normalized.circle.radiusMeters,
          latitude: addr.latitude ?? null,
          longitude: addr.longitude ?? null,
          rawResponse: addr as any,
        };

        const existing = await appPrisma.samsaraAddress.findUnique({
          where: { clerkOrgId_samsaraAddressId: { clerkOrgId, samsaraAddressId } },
        });

        if (!existing) {
          await appPrisma.samsaraAddress.create({
            data: { clerkOrgId, samsaraAddressId, ...data },
          });
          result.newCount++;
        } else {
          // Always update — addresses are configuration data and can be renamed/edited.
          await appPrisma.samsaraAddress.update({
            where: { clerkOrgId_samsaraAddressId: { clerkOrgId, samsaraAddressId } },
            data,
          });
          result.updatedCount++;
        }
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(addr.id ?? 'unknown'), error: error.message });
      }
    }

    console.log(
      `[Samsara] Addresses sync complete: ${result.newCount} new, ${result.updatedCount} updated, ${result.errorCount} errors`
    );
    return result;
  } catch (error: any) {
    if (error?.name?.startsWith('Telematics')) throw error;
    console.error(`[Samsara] syncSamsaraAddresses error:`, error);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: error.message });
    return result;
  }
}
