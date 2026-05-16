/**
 * Single-org orchestrator: build weekly reports for one org and send SMS to
 * each enrolled, non-opted-out driver with a phone number. Idempotent on
 * (orgId, driverContactId, weekStartDate).
 *
 * Rows are persisted in QUEUED status BEFORE Twilio is called so a process
 * crash mid-send leaves a trace; status is updated to SENT or FAILED based
 * on the result.
 */

import { randomBytes } from 'crypto';
import { config } from '../../config.js';
import { getAppPrisma } from '../../lib/prisma.js';
import { sendSms } from '../../integrations/twilio/client.js';
import { buildWeeklyReports, type DriverWeeklyReport } from './weeklyReportBuilder.js';
import { formatSmsBody } from './smsBodyFormatter.js';
import { DriverSmsStatus } from '../../generated/app-client/index.js';

const TOKEN_TTL_DAYS = 30;

export interface SendOrgResult {
  clerkOrgId: string;
  success: boolean;
  weekStart: string;
  weekEnd: string;
  duration: number;
  driversTotal: number;
  driversSent: number;
  driversSkipped: number;
  driversFailed: number;
  driversNoPhone: number;
  driversOptedOut: number;
  reports: Array<{
    driverContactId: string;
    displayName: string;
    status: DriverSmsStatus;
    twilioSid: string | null;
    error?: string | null;
  }>;
  error?: string;
}

export interface SendOrgOptions {
  dryRun?: boolean;
  onlyDriverContactId?: string;
  now?: Date;
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

function tokenExpiresAt(): Date {
  return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function reportUrl(token: string): string {
  return `${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/${token}`;
}

function buildKpiSnapshot(report: DriverWeeklyReport): object {
  return {
    displayName: report.displayName,
    firstName: report.firstName,
    motiveDriverId: report.motiveDriverId,
    weekStart: report.trend.length > 0 ? report.trend[report.trend.length - 1].weekStart : '',
    rank: report.rank,
    totalDrivers: report.totalDrivers,
    fleetAvgMpg: report.fleetAvgMpg,
    noActivity: report.noActivity,
    current: report.current,
    trend: report.trend,
    trailing4WeekAvg: report.trailing4WeekAvg,
    diffVsAvg: report.diffVsAvg,
  };
}

export async function sendOrgWeeklyReports(
  clerkOrgId: string,
  options: SendOrgOptions = {}
): Promise<SendOrgResult> {
  const startedAt = Date.now();
  const prisma = getAppPrisma();

  let built: Awaited<ReturnType<typeof buildWeeklyReports>>;
  try {
    built = await buildWeeklyReports(clerkOrgId, options.now);
  } catch (err: any) {
    return {
      clerkOrgId,
      success: false,
      weekStart: '',
      weekEnd: '',
      duration: Date.now() - startedAt,
      driversTotal: 0,
      driversSent: 0,
      driversSkipped: 0,
      driversFailed: 0,
      driversNoPhone: 0,
      driversOptedOut: 0,
      reports: [],
      error: `buildWeeklyReports failed: ${err.message ?? err}`,
    };
  }

  const counters = { sent: 0, skipped: 0, failed: 0, noPhone: 0, optedOut: 0 };
  const out: SendOrgResult['reports'] = [];

  const reportsToProcess = options.onlyDriverContactId
    ? built.reports.filter((r) => r.driverContactId === options.onlyDriverContactId)
    : built.reports;

  for (const report of reportsToProcess) {
    // Skip drivers without a DriverContact row (shouldn't happen — builder reconciles)
    if (!report.driverContactId) {
      counters.skipped++;
      continue;
    }

    let status: DriverSmsStatus;
    let skipReason: string | null = null;
    if (!report.enrolled) {
      status = DriverSmsStatus.SKIPPED;
      skipReason = 'not-enrolled';
    } else if (report.optedOut) {
      status = DriverSmsStatus.OPTED_OUT;
      counters.optedOut++;
    } else if (!report.phoneE164) {
      status = DriverSmsStatus.NO_PHONE;
      counters.noPhone++;
    } else if (options.dryRun) {
      status = DriverSmsStatus.SKIPPED;
      skipReason = 'dry-run';
    } else {
      status = DriverSmsStatus.QUEUED;
    }

    const token = newToken();
    const kpiSnapshot = buildKpiSnapshot(report);
    const body =
      status === DriverSmsStatus.QUEUED || status === DriverSmsStatus.SKIPPED
        ? formatSmsBody({
            firstName: report.firstName,
            rank: report.rank,
            totalDrivers: report.totalDrivers,
            noActivity: report.noActivity,
            reportUrl: reportUrl(token),
          })
        : null;

    // Persist FIRST, then attempt send. Upsert handles idempotency across cron retries.
    let row;
    try {
      row = await prisma.driverWeeklyReportSent.upsert({
        where: {
          clerkOrgId_driverContactId_weekStartDate: {
            clerkOrgId,
            driverContactId: report.driverContactId,
            weekStartDate: built.weekStart,
          },
        },
        create: {
          clerkOrgId,
          driverContactId: report.driverContactId,
          weekStartDate: built.weekStart,
          sentAt: new Date(),
          status,
          twilioSid: null,
          twilioErrorCode: null,
          token,
          tokenExpiresAt: tokenExpiresAt(),
          kpiSnapshot,
          bodyPreview: body,
          isTest: false,
        },
        update: {
          // Only re-attempt sends that are in non-terminal states; preserve token if already SENT/DELIVERED.
          status,
          bodyPreview: body,
          kpiSnapshot,
          ...(status === DriverSmsStatus.QUEUED
            ? { token, tokenExpiresAt: tokenExpiresAt() }
            : {}),
        },
        select: { id: true, token: true, status: true },
      });
    } catch (err: any) {
      counters.failed++;
      out.push({
        driverContactId: report.driverContactId,
        displayName: report.displayName,
        status: DriverSmsStatus.FAILED,
        twilioSid: null,
        error: `persistence error: ${err.message}`,
      });
      continue;
    }

    if (row.status !== DriverSmsStatus.QUEUED) {
      if (row.status === DriverSmsStatus.SKIPPED) counters.skipped++;
      out.push({
        driverContactId: report.driverContactId,
        displayName: report.displayName,
        status: row.status,
        twilioSid: null,
        error: skipReason,
      });
      continue;
    }

    // Send
    const sendResult = await sendSms({ to: report.phoneE164!, body: body! });
    const finalStatus: DriverSmsStatus = sendResult.status === 'failed'
      ? DriverSmsStatus.FAILED
      : DriverSmsStatus.SENT;
    if (finalStatus === DriverSmsStatus.SENT) counters.sent++;
    else counters.failed++;

    await prisma.driverWeeklyReportSent.update({
      where: { id: row.id },
      data: {
        status: finalStatus,
        twilioSid: sendResult.sid,
        twilioErrorCode: sendResult.errorCode,
      },
    });
    if (finalStatus === DriverSmsStatus.FAILED) {
      await prisma.driverContact.update({
        where: { id: report.driverContactId },
        data: { lastTwilioError: sendResult.errorMessage },
      });
    }

    out.push({
      driverContactId: report.driverContactId,
      displayName: report.displayName,
      status: finalStatus,
      twilioSid: sendResult.sid,
      error: sendResult.errorMessage,
    });

    // Small pacing delay to stay well under A2P 10DLC throughput limits
    if (!options.dryRun) await new Promise((r) => setTimeout(r, 200));
  }

  // Bump lastSentAt on the config so admin UI can show freshness
  if (!options.dryRun && counters.sent > 0) {
    await prisma.customerSmsReportConfig.update({
      where: { clerkOrgId },
      data: { lastSentAt: new Date() },
    }).catch((e) => console.warn(`[smsWeeklyReports] failed to update lastSentAt: ${e.message}`));
  }

  return {
    clerkOrgId,
    success: counters.failed === 0,
    weekStart: built.weekStart,
    weekEnd: built.weekEnd,
    duration: Date.now() - startedAt,
    driversTotal: built.reports.length,
    driversSent: counters.sent,
    driversSkipped: counters.skipped,
    driversFailed: counters.failed,
    driversNoPhone: counters.noPhone,
    driversOptedOut: counters.optedOut,
    reports: out,
  };
}
