/**
 * Persist telematics daily cron summaries (Samsara / Motive) for admin debugging.
 */

import { CronJobType } from '../generated/app-client/index.js';
import { getAppPrisma } from './prisma.js';

export type OrgSyncResultForCron = {
  clerkOrgId: string;
  success: boolean;
  date: string;
  verify: boolean;
  duration: number;
  error?: string;
  results: Array<{
    endpoint: string;
    date: string;
    recordCount: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    errorCount: number;
    skipped?: boolean;
    skipReason?: string;
  }>;
};

export type DailySyncSummary = {
  totalOrgs: number;
  successCount: number;
  errorCount: number;
  results: OrgSyncResultForCron[];
  duration: number;
};

function buildReport(summary: DailySyncSummary) {
  return {
    passes: summary.results.map((r) => ({
      clerkOrgId: r.clerkOrgId,
      date: r.date,
      verify: r.verify,
      success: r.success,
      durationMs: r.duration,
      error: r.error ?? null,
      steps: r.results.map((s) => ({
        endpoint: s.endpoint,
        newCount: s.newCount,
        updatedCount: s.updatedCount,
        unchangedCount: s.unchangedCount,
        errorCount: s.skipped ? 0 : s.errorCount,
        recordCount: s.recordCount,
        skipped: s.skipped ?? false,
        skipReason: s.skipReason ?? null,
      })),
    })),
  };
}

export async function recordTelematicsCronRun(
  job: CronJobType,
  summary: DailySyncSummary
): Promise<void> {
  try {
    const prisma = getAppPrisma();
    const finishedAt = new Date();
    const startedAt = new Date(finishedAt.getTime() - summary.duration);
    const allSucceeded = summary.errorCount === 0;

    await prisma.telematicsCronRun.create({
      data: {
        job,
        startedAt,
        finishedAt,
        durationMs: summary.duration,
        totalOrgs: summary.totalOrgs,
        successOrgs: summary.successCount,
        failedOrgs: summary.errorCount,
        allSucceeded,
        report: buildReport(summary) as object,
      },
    });
  } catch (e) {
    console.error('[TelematicsCronRun] Failed to persist cron summary:', e);
  }
}
