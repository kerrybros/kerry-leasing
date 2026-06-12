/**
 * SYNC SAMSARA DRIVER SAFETY SCORES
 *
 * Source: GET /safety-scores/drivers (range-aggregated; called per day).
 * Writes per-driver-per-day rows to samsara_driver_efficiency.
 *
 * Captures Samsara's own driverScore + behavior counts for reference / sanity-
 * check. Our scorecard does NOT consume this score — it computes its own per-mile
 * weighted safety from the raw safety-event stream (mirrors the Motive approach).
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { fetchDriverSafetyScores } from '../endpoints/driverSafetyScores.js';
import { SamsaraConversions } from '../endpoints/fuelEnergyReports.js';
import { SyncResult } from '../types.js';

// Sum behavior counts by Samsara behavior type → bucketed counts our schema stores.
function bucketBehaviors(behaviors: Array<{ behaviorType: string; count?: number }> | undefined): {
  harshBrakingCount: number;
  harshAccelCount: number;
  harshTurnCount: number;
  speedingCount: number;
} {
  let harshBrakingCount = 0;
  let harshAccelCount = 0;
  let harshTurnCount = 0;
  let speedingCount = 0;
  for (const b of behaviors ?? []) {
    const t = b.behaviorType?.toLowerCase() ?? '';
    const n = b.count ?? 0;
    if (t.includes('brak')) harshBrakingCount += n;
    else if (t.includes('accel')) harshAccelCount += n;
    else if (t.includes('turn') || t.includes('corner')) harshTurnCount += n;
    else if (t.includes('speed')) speedingCount += n;
  }
  return { harshBrakingCount, harshAccelCount, harshTurnCount, speedingCount };
}

export async function syncSamsaraDriverSafetyScores(
  clerkOrgId: string,
  apiToken: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'driver_safety_scores',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);
  console.log(`[Samsara] Starting driver safety-scores sync for org ${clerkOrgId}, date ${date}`);

  try {
    const scores = await fetchDriverSafetyScores(client, date);
    result.recordCount = scores.length;

    if (scores.length === 0) {
      console.log(`[Samsara] No driver safety-score data for ${date}`);
      return result;
    }

    for (const s of scores) {
      try {
        const driverId = String(s.driverId);

        // Speeding bucketing — sum all speeding-type counts (~= row count). The schema
        // stores a single `speedingCount`; we'll roll all severities into it.
        const speedingFromBehaviors = bucketBehaviors(s.behaviors);
        const speedingTotal =
          speedingFromBehaviors.speedingCount +
          (s.speeding ?? []).length;

        const distMi = s.driveDistanceMeters != null
          ? SamsaraConversions.metersToMiles(s.driveDistanceMeters)
          : null;

        const data = {
          driverName: null as string | null,
          driverExternalId: null as string | null,
          overallSafetyScore: s.driverScore ?? null,
          speedingScore: null, // Samsara breaks score down by behavior impact, not by category
          harshBrakingScore: null,
          harshAccelScore: null,
          harshBrakingCount: speedingFromBehaviors.harshBrakingCount,
          harshAccelCount:   speedingFromBehaviors.harshAccelCount,
          harshTurnCount:    speedingFromBehaviors.harshTurnCount,
          speedingCount:     speedingTotal,
          totalDistanceMiles: distMi,
          rawResponse: s as any,
        };

        // Single round-trip upsert. Daily score may shift inside Samsara's
        // 72h lag, so the row is always written (no changed-vs-unchanged check).
        await appPrisma.samsaraDriverEfficiency.upsert({
          where: { clerkOrgId_driverId_date: { clerkOrgId, driverId, date } },
          create: { clerkOrgId, driverId, date, ...data },
          update: data,
        });
        result.updatedCount++;
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(s.driverId ?? 'unknown'), error: err.message });
      }
    }

    console.log(
      `[Samsara] Driver safety-scores ${date}: ${result.updatedCount} upserted, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    console.error(`[Samsara] syncSamsaraDriverSafetyScores error:`, err);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: err.message });
    return result;
  }
}
