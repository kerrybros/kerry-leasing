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
import { gatherDriverVehicles, gatherFleetComparison, type FleetTotals } from './weeklyDigestData.js';
import { formatSmsBody } from './smsBodyFormatter.js';
import { formatEmailBody } from './emailBodyFormatter.js';
import { decideChannelStatus } from './reportPolicy.js';
import { assertReportBackedOrThrow } from './requireReportSource.js';
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
  driversNoConsent: number;  // SMS suppressed: no verified opt-in on file (A2P 10DLC)
  reports: Array<{
    driverContactId: string;
    displayName: string;
    channel: ReportChannel;
    status: DriverSmsStatus;
    twilioSid: string | null;
    error?: string | null;
  }>;
  /**
   * One row per DRIVER (not per channel) carrying what actually went out, for
   * the operator digest. Built here because this is the only place the card's
   * numbers and the send outcome are both in scope; re-deriving them afterwards
   * could disagree with what the drivers were told.
   */
  digest: WeeklyDigestDriver[];
  /** Customer-facing name for the subject line, e.g. "Wolverine". */
  reportDisplayName?: string | null;
  /** Fleet totals for this week and the one before, for the digest header. */
  fleet?: { current: FleetTotals | null; previous: FleetTotals | null };
  error?: string;
}

/** A driver's line in the weekly operator digest. */
export interface WeeklyDigestDriver {
  displayName: string;
  channels: Array<{ channel: ReportChannel; status: DriverSmsStatus; error?: string | null }>;
  /** Motive's OWN rolling 4-week safety score, surfaced verbatim. */
  motiveSafetyScore: number | null;
  /** That score against the average of the earlier weeks on this card. */
  motiveSafetyVsAvg: number | null;
  score: number;
  idlePct: number;
  /** Gallons burned at idle. The third tile on the driver's own card. */
  idleFuelGal: number;
  /** Last week's idle fuel, or null when there is no prior week. */
  idleFuelGalLastWeek: number | null;
  avgMpg: number;
  totalMiles: number;
  /** Current week minus their trailing four week average. */
  scoreVsAvg: number;
  idlePctPtsVsAvg: number;
  /** Last week's idle percentage, or null when there is no prior week. */
  idlePctLastWeek: number | null;
  /** Weeks of data behind the card. 1 means this is their first week. */
  weeksOfData: number;
  noActivity: boolean;
  /** Units this driver was in over the week, busiest first. */
  vehicles: string[];
  /** Printed on the clean report so the fleet admin can act without a lookup. */
  phoneE164: string | null;
  email: string | null;
  /** Why nothing was sent, when nothing was. */
  suppressedReason?: string;
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

export function buildKpiSnapshot(report: DriverWeeklyReport): object {
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

/**
 * What an upsert may change on a row that already exists for this
 * (org, driver, week, channel).
 *
 * Only ever reached on a real send: a dry run returns before persisting at all.
 * That ordering matters because the unique key means a preview would land on
 * the SAME row as the week's real send. When it did, it overwrote DELIVERED
 * with SKIPPED while leaving the Twilio SID behind, and for the week of
 * 2026-09-21 Twilio reported 35 delivered while our own table reported none.
 */
export function buildSendUpdatePayload(input: {
  status: DriverSmsStatus;
  bodyPreview: string | null;
  kpiSnapshot: unknown;
  token: string;
  tokenExpiresAt: Date;
}): Record<string, unknown> {
  return {
    bodyPreview: input.bodyPreview,
    kpiSnapshot: input.kpiSnapshot,
    // Re-attempt non-terminal sends; refresh token only when re-queuing.
    status: input.status,
    ...(input.status === DriverSmsStatus.QUEUED
      ? { token: input.token, tokenExpiresAt: input.tokenExpiresAt }
      : {}),
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
    built = await buildWeeklyReports(clerkOrgId, options.now, { dryRun: options.dryRun === true });
    // Once an org is on Motive's dashboard report, every week on the card has
    // to come from it. A week that quietly falls back to the API puts a
    // 20-to-30 point idle error next to three correct weeks and makes the
    // trend and the four week average read backwards for yard drivers. Better
    // to send nothing and shout than to send that.
    await assertReportBackedOrThrow(clerkOrgId, built.weekSources);
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
      driversNoConsent: 0,
      reports: [],
      digest: [],
      reportDisplayName: null,
      fleet: { current: null, previous: null },
      error: `buildWeeklyReports failed: ${err.message ?? err}`,
    };
  }

  // Which channels does this org want? null/absent = SMS only.
  const cfg = await prisma.customerSmsReportConfig.findUnique({
    where: { clerkOrgId },
    select: { channels: true, reportDisplayName: true },
  });
  const channels = resolveChannels(cfg?.channels);

  const counters = { sent: 0, skipped: 0, failed: 0, noPhone: 0, optedOut: 0, noConsent: 0 };
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

  // Digest extras. Failing to gather them must never fail a send that already
  // happened, so both degrade to empty rather than throwing.
  const [vehiclesByDriver, fleet] = await Promise.all([
    gatherDriverVehicles(clerkOrgId, built.weekStart, built.weekEnd).catch((e) => {
      console.warn(`[smsWeeklyReports] vehicle lookup failed: ${e.message}`);
      return new Map<number, string[]>();
    }),
    gatherFleetComparison(clerkOrgId, built.weekStart, built.weekEnd).catch((e) => {
      console.warn(`[smsWeeklyReports] fleet totals failed: ${e.message}`);
      return { current: null, previous: null };
    }),
  ]);

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
    driversNoConsent: counters.noConsent,
    reports: out,
    reportDisplayName: cfg?.reportDisplayName ?? null,
    fleet,
    digest: reportsToProcess
      .filter((r) => r.driverContactId)
      .map((r) => {
        const sent = out.filter((o) => o.driverContactId === r.driverContactId);
        return {
          displayName: r.displayName,
          channels: sent.map((o) => ({ channel: o.channel, status: o.status, error: o.error })),
          motiveSafetyScore: r.motiveScore,
          // Compared against the earlier weeks on the card, not a fleet average:
          // the question is whether this driver improved on themselves.
          motiveSafetyVsAvg: (() => {
            const prior = r.trend.slice(0, -1).map((t) => t.motiveScore).filter((x): x is number => x != null);
            if (r.motiveScore == null || prior.length === 0) return null;
            return r.motiveScore - prior.reduce((a, b) => a + b, 0) / prior.length;
          })(),
          score: r.current.score,
          idlePct: r.current.idlePct,
          idleFuelGal: r.current.idleFuelGal,
          idleFuelGalLastWeek:
            r.trend.length >= 2 ? r.trend[r.trend.length - 2].idleFuelGal : null,
          avgMpg: r.current.avgMpg,
          totalMiles: r.current.totalMiles,
          scoreVsAvg: r.diffVsAvg.score,
          idlePctPtsVsAvg: r.diffVsAvg.idlePctPts,
          // trend runs oldest to newest with the current week last, so the
          // point before it is last week.
          idlePctLastWeek: r.trend.length >= 2 ? r.trend[r.trend.length - 2].idlePct : null,
          weeksOfData: r.trend.length,
          noActivity: r.noActivity,
          vehicles: vehiclesByDriver.get(r.motiveDriverId) ?? [],
          phoneE164: r.phoneE164,
          email: r.email,
          suppressedReason: sent.length > 0 ? undefined : suppressionReason(r),
        };
      }),
  };

  /**
   * Why this driver received nothing. Reported in the driver's own terms so the
   * digest names the thing to fix rather than the symptom.
   */
  function suppressionReason(r: DriverWeeklyReport): string {
    if (r.noActivity) return 'no activity this week';
    if (!r.enrolled) return 'not enrolled';
    if (!r.phoneE164 && !r.email) return 'no phone or email on file';
    if (r.optedOut && r.emailOptedOut) return 'opted out of both channels';
    if (r.smsConsentStatus !== 'CONFIRMED' && !r.email) return 'SMS consent not confirmed and no email';
    return 'suppressed by send policy';
  }

  // -------------------------------------------------------------------------
  // Per-(driver, channel) send. Closure over prisma/counters/out/built so the
  // SMS and EMAIL paths share one persistence-first flow.
  // -------------------------------------------------------------------------
  async function sendOneChannel(channel: ReportChannel, report: DriverWeeklyReport): Promise<void> {
    const isEmail = channel === 'EMAIL';
    const recipient = isEmail ? report.email : report.phoneE164;
    const channelOptedOut = isEmail ? report.emailOptedOut : report.optedOut;

    const { status, skipReason } = decideChannelStatus({
      enrolled: report.enrolled,
      channelOptedOut,
      isEmail,
      smsConsentStatus: report.smsConsentStatus,
      hasRecipient: recipient != null,
      dryRun: options.dryRun === true,
    });
    if (status === DriverSmsStatus.OPTED_OUT) counters.optedOut++;
    else if (status === DriverSmsStatus.NO_CONSENT) counters.noConsent++;
    else if (status === DriverSmsStatus.NO_PHONE || status === DriverSmsStatus.NO_EMAIL) counters.noPhone++;

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

    // A dry run writes NOTHING. It used to reach the upsert below, which
    // created a row for a week nobody was sent: that row carried the dry run's
    // timestamp, so a later investigation read the preview's clock as the send's
    // and concluded a delivered week had never gone out. A preview reports what
    // it would do and touches no state.
    if (options.dryRun) {
      if (status === DriverSmsStatus.SKIPPED) counters.skipped++;
      out.push({
        driverContactId: report.driverContactId,
        displayName: report.displayName,
        channel,
        status,
        twilioSid: null,
        error: skipReason,
      });
      return;
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
        update: buildSendUpdatePayload({
          status,
          bodyPreview: body,
          kpiSnapshot,
          token,
          tokenExpiresAt: tokenExpiresAt(),
        }),
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

    const effectiveStatus = row.status;
    if (effectiveStatus !== DriverSmsStatus.QUEUED) {
      if (effectiveStatus === DriverSmsStatus.SKIPPED) counters.skipped++;
      out.push({
        driverContactId: report.driverContactId,
        displayName: report.displayName,
        channel,
        status: effectiveStatus,
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
