/**
 * SYNC MOTIVE SCORECARD SUMMARIES
 * Fetches driver scorecard summaries from Motive API and stores per driver per day.
 *
 * Source: GET /v1/scorecard_summary
 * Writes to: motive_scorecard_summaries
 *
 * Note: This endpoint returns DRIVER performance rollups (score, hard events, km).
 * It uses company-configured rollup timezone (not UTC) — date params are calendar dates.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { SyncResult } from '../types.js';

interface MotiveScorecardDriver {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
}

interface MotiveDriverPerformanceRollup {
  driver?: MotiveScorecardDriver;
  score?: number;
  num_coached_events?: number;
  num_hard_accels?: number;
  num_hard_brakes?: number;
  num_hard_corners?: number;
  total_kilometers?: number;
}

export async function syncMotiveScorecard(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'scorecard_summary',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  try {
    const client = new MotiveClient(apiKey);

    const records = await client.get<MotiveDriverPerformanceRollup>(
      '/v1/scorecard_summary',
      { start_date: date, end_date: date }
    );

    result.recordCount = records.length;

    for (const record of records) {
      try {
        if (!record.driver?.id) {
          result.recordCount--;
          continue;
        }

        const driverId = record.driver.id;

        const existing = await appPrisma.motiveScorecardSummary.findUnique({
          where: { clerkOrgId_driverId_date: { clerkOrgId, driverId, date } },
        });

        const recordData = {
          clerkOrgId,
          driverId,
          driverFirstName: record.driver.first_name ?? null,
          driverLastName: record.driver.last_name ?? null,
          driverUsername: record.driver.username ?? null,
          driverEmail: record.driver.email ?? null,
          date,
          score: record.score ?? null,
          numCoachedEvents: record.num_coached_events ?? null,
          numHardAccels: record.num_hard_accels ?? null,
          numHardBrakes: record.num_hard_brakes ?? null,
          numHardCorners: record.num_hard_corners ?? null,
          totalKilometers: record.total_kilometers ?? null,
          rawResponse: record as any,
        };

        if (!existing) {
          await appPrisma.motiveScorecardSummary.create({ data: recordData });
          result.newCount++;
        } else {
          const hasChanged =
            existing.score !== recordData.score ||
            existing.numHardAccels !== recordData.numHardAccels ||
            existing.numHardBrakes !== recordData.numHardBrakes ||
            existing.numHardCorners !== recordData.numHardCorners;

          if (hasChanged || verify) {
            await appPrisma.motiveScorecardSummary.update({
              where: { clerkOrgId_driverId_date: { clerkOrgId, driverId, date } },
              data: recordData,
            });
            result.updatedCount++;
          } else {
            result.unchangedCount++;
          }
        }
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(record.driver?.id ?? 'unknown'), error: err.message });
      }
    }

    console.log(
      `[Motive] Scorecard sync for ${date}: ${result.newCount} new, ${result.unchangedCount} unchanged, ` +
      `${result.updatedCount} updated, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    console.error(`Failed to sync Motive scorecard for ${clerkOrgId} on ${date}:`, err.message);
    result.errorCount = 1;
    result.errors.push({ recordId: 'scorecard_summary', error: err.message });
    return result;
  }
}
