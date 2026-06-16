/**
 * Single-org orchestrator: build weekly reports for one org and deliver each
 * enrolled, reachable driver's scorecard over every channel the org has enabled
 * (SMS and/or EMAIL). Idempotent on (orgId, driverContactId, weekStartDate,
 * channel) — one row per channel per driver per week.
 *
 * Rows are persisted in QUEUED status BEFORE the provider (Twilio / Graph) is
 * called so a process crash mid-send leaves a trace; status is updated to SENT
 * or FAILED based on the result.
 */

import { randomBytes } from 'crypto';
import { config } from '../../config.js';
import { getAppPrisma } from '../../lib/prisma.js';
import { sendSms } from '../../integrations/twilio/client.js';
import { sendEmail } from '../../integrations/email/client.js';
import { buildWeeklyReports, type DriverWeeklyReport } from './weeklyReportBuilder.js';
import { formatSmsBody } from './smsBodyFormatter.js';
import { formatEmailBody } from './emailBodyFormatter.js';
import { DriverSmsStatus } from '../../generated/app-client/index.js';

const TOKEN_TTL_DAYS = 30;

export type ReportChannel = 'SMS' | 'EMAIL';

/**
 * Normalize the per-org `channels` JSON (string[] of SMS|EMAIL) to a clean list.
 * null/absent/empty → ['SMS'] so existing configs keep sending SMS unchanged.
 */
export function resolveChannels(raw: unknown): ReportChannel[] {
  if (Array.isArray(raw)) {
    const valid = raw.filter((c): c is ReportChannel => c === 'SMS' || c === 'EMAIL');
    if (valid.length > 0) return [...new Set(valid)];
  }
  return ['SMS'];
}

export interface SendOrgResult {
  clerkOrgId: string;
  success: boolean;
  weekStart: string;
  weekEnd: string;
  duration: number;
  channels: ReportChannel[];
  driversTotal: number;
  driversSent: number;     // counts per-channel sends (a driver on both channels counts twice)
  driversSkipped: number;
  driversFailed: number;
  driversNoPhone: number;
  driversOptedOut: number;
  reports: Array<{
    driverContactId: string;
    displayName: string;
    channel: ReportChannel;
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

function unsubscribeUrl(token: string): string {
  return `${config.reportPublicBaseUrl.replace(/\/$/, '')}/u/${token}`;
}

function buildKpiSnapshot(report: DriverWeeklyReport): object {
  return {
    displayName: report.displayName,
    firstName: report.firstName,
    motiveDriverId: report.motiveDriverId,
    weekStart: report.trend.length > 0 ? report.trend[report.trend.length - 1].weekStart : '',
    motiveScore: report.motiveScore,
    rank: report.rank,
    idleRank: report.idleRank,
    safetyRank: report.safetyRank,
    safetyTotal: report.safetyTotal,
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
      channels: [],
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

  // Which channels does this org want? null/absent = SMS only.
  const cfg = await prisma.customerSmsReportConfig.findUnique({
    where: { clerkOrgId },
    select: { channels: true },
  });
  const channels = resolveChannels(cfg?.channels);

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
    for (const channel of channels) {
      await sendOneChannel(channel, report);
    }
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
    channels,
    driversTotal: built.reports.length,
    driversSent: counters.sent,
    driversSkipped: counters.skipped,
    driversFailed: counters.failed,
    driversNoPhone: counters.noPhone,
    driversOptedOut: counters.optedOut,
    reports: out,
  };

  // -------------------------------------------------------------------------
  // Per-(driver, channel) send. Closure over prisma/counters/out/built so the
  // SMS and EMAIL paths share one persistence-first flow.
  // -------------------------------------------------------------------------
  async function sendOneChannel(channel: ReportChannel, report: DriverWeeklyReport): Promise<void> {
    const isEmail = channel === 'EMAIL';
    const recipient = isEmail ? report.email : report.phoneE164;
    const channelOptedOut = isEmail ? report.emailOptedOut : report.optedOut;

    let status: DriverSmsStatus;
    let skipReason: string | null = null;
    if (!report.enrolled) {
      status = DriverSmsStatus.SKIPPED;
      skipReason = 'not-enrolled';
    } else if (channelOptedOut) {
      status = DriverSmsStatus.OPTED_OUT;
      counters.optedOut++;
    } else if (!recipient) {
      status = isEmail ? DriverSmsStatus.NO_EMAIL : DriverSmsStatus.NO_PHONE;
      counters.noPhone++;
    } else if (options.dryRun) {
      status = DriverSmsStatus.SKIPPED;
      skipReason = 'dry-run';
    } else {
      status = DriverSmsStatus.QUEUED;
    }

    const token = newToken();
    const kpiSnapshot = buildKpiSnapshot(report);

    // Build the body only for rows we'd actually render/send (QUEUED) or want a
    // preview for (SKIPPED). For SMS that's the one-liner; for email the text part.
    let body: string | null = null;
    let emailParts: { subject: string; text: string; html: string } | null = null;
    if (status === DriverSmsStatus.QUEUED || status === DriverSmsStatus.SKIPPED) {
      if (isEmail) {
        emailParts = formatEmailBody({
          firstName: report.firstName,
          noActivity: report.noActivity,
          reportUrl: reportUrl(token),
          unsubscribeUrl: unsubscribeUrl(token),
        });
        body = emailParts.text;
      } else {
        body = formatSmsBody({
          firstName: report.firstName,
          noActivity: report.noActivity,
          reportUrl: reportUrl(token),
        });
      }
    }

    // Persist FIRST, then attempt send. Upsert handles idempotency across cron retries.
    let row;
    try {
      row = await prisma.driverWeeklyReportSent.upsert({
        where: {
          clerkOrgId_driverContactId_weekStartDate_channel: {
            clerkOrgId,
            driverContactId: report.driverContactId,
            weekStartDate: built.weekStart,
            channel,
          },
        },
        create: {
          clerkOrgId,
          driverContactId: report.driverContactId,
          weekStartDate: built.weekStart,
          channel,
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
          // Re-attempt non-terminal sends; refresh token only when re-queuing.
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
        channel,
        status: DriverSmsStatus.FAILED,
        twilioSid: null,
        error: `persistence error: ${err.message}`,
      });
      return;
    }

    if (row.status !== DriverSmsStatus.QUEUED) {
      if (row.status === DriverSmsStatus.SKIPPED) counters.skipped++;
      out.push({
        driverContactId: report.driverContactId,
        displayName: report.displayName,
        channel,
        status: row.status,
        twilioSid: null,
        error: skipReason,
      });
      return;
    }

    // Send via the channel's provider. Both return a typed result (never throw)
    // and no-op in their respective dry-run modes.
    let finalStatus: DriverSmsStatus;
    let twilioSid: string | null = null;
    let twilioErrorCode: string | null = null;
    let errorMessage: string | null = null;
    if (isEmail) {
      const res = await sendEmail({
        to: recipient!,
        subject: emailParts!.subject,
        text: emailParts!.text,
        html: emailParts!.html,
      });
      finalStatus = res.status === 'failed' ? DriverSmsStatus.FAILED : DriverSmsStatus.SENT;
      errorMessage = res.errorMessage;
      if (finalStatus === DriverSmsStatus.FAILED) {
        console.error(`[smsWeeklyReports] email send failed for ${report.driverContactId}: ${errorMessage}`);
      }
    } else {
      const res = await sendSms({ to: recipient!, body: body! });
      finalStatus = res.status === 'failed' ? DriverSmsStatus.FAILED : DriverSmsStatus.SENT;
      twilioSid = res.sid;
      twilioErrorCode = res.errorCode;
      errorMessage = res.errorMessage;
    }
    if (finalStatus === DriverSmsStatus.SENT) counters.sent++;
    else counters.failed++;

    await prisma.driverWeeklyReportSent.update({
      where: { id: row.id },
      data: { status: finalStatus, twilioSid, twilioErrorCode },
    });
    if (finalStatus === DriverSmsStatus.FAILED && !isEmail) {
      await prisma.driverContact.update({
        where: { id: report.driverContactId },
        data: { lastTwilioError: errorMessage },
      });
    }

    out.push({
      driverContactId: report.driverContactId,
      displayName: report.displayName,
      channel,
      status: finalStatus,
      twilioSid,
      error: errorMessage,
    });

    // Pace sends to stay under provider throughput limits. Twilio A2P 10DLC and
    // Graph sendMail (~30 msg/min/mailbox) are both comfortable at this rate for
    // pilot-scale driver counts; revisit batching if a single org's email
    // population grows large enough to approach Graph's per-minute ceiling.
    if (!options.dryRun) await new Promise((r) => setTimeout(r, 200));
  }
}
