/**
 * MOTIVE SCHEDULED-REPORT MAILBOX INTAKE
 *
 * Reads the shared mailbox (config.motiveReportMailbox) via Microsoft Graph,
 * finds Motive "Driver Fuel Performance" scheduled-report emails, downloads the
 * CSV attachment, parses it, and stores the rows keyed by the window in the
 * email subject. Routes each email to an org by the company name in the body
 * ("...scheduled by <user> from <COMPANY> is ready"), matched against
 * telematics_provider_accounts.motive_report_company_name.
 *
 * Idempotent: every email's internetMessageId is the ingest sourceRef, so
 * rescanning a 14-day lookback each run is cheap and safe. Read-only on the
 * mailbox: nothing is marked read, moved or deleted.
 */

import { config } from '../../config.js';
import { getAppPrisma } from '../../lib/prisma.js';
import { listMailMessages, getMailAttachments } from '../../integrations/microsoft/graphClient.js';
import { MotiveReportIngestStatus, MotiveReportSource, TelematicsProvider, TelematicsProviderStatus } from '../../generated/app-client/index.js';
import { parseDriverFuelPerformanceCsv, ReportParseError } from './parseDriverFuelPerformanceCsv.js';
import { windowFromSubject, type SubjectWindow } from './reportWindow.js';
import { storeReport } from './reportStore.js';

export const MOTIVE_NOTIFICATIONS_SENDER = 'notifications@gomotive.com';
// Motive's subject is "Your <SCHEDULE NAME> Report for <range> is ready", so the
// text before "Report for" is whatever the schedule was named in the dashboard,
// NOT the report's name. Matching on "Driver Fuel Performance" therefore breaks
// the moment someone renames the schedule (it silently skipped every schedule
// named TEST... during the 2026-09 timing trial). Match the scheduled-report
// shape instead and let the strict CSV header check reject anything that is not
// a Driver Fuel Performance export.
const REPORT_SUBJECT_RE = /Report for .+ is ready/i;
const DEFAULT_LOOKBACK_DAYS = 14;

export interface IngestedEmail {
  messageId: string;
  subject: string;
  receivedAt: string;
  status: 'ingested' | 'unverified' | 'duplicate' | 'unrouted' | 'no_attachment' | 'no_window' | 'parse_error' | 'error';
  clerkOrgId: string | null;
  companyName: string | null;
  window: { start: string; end: string; granularity: string } | null;
  rowCount: number;
  unmatchedDriverNames: string[];
  error?: string;
}

export interface MailboxIngestSummary {
  mailbox: string | null;
  scanned: number;
  ingested: number;
  unverified: number;
  duplicates: number;
  failed: number;
  unrouted: number;
  duration: number;
  emails: IngestedEmail[];
  /** Set when the job could not run at all (no mailbox/Graph config). */
  skippedReason?: string;
}

/**
 * Strict acceptance for a SCHEDULED file. Anything that does not look exactly
 * like the behaviour verified on 2026-09-14/18 is stored as UNVERIFIED and
 * never scores. Returns null when the file is acceptable.
 *
 *  - The label must end on the delivery day (that day is then trimmed off).
 *    Motive's batch never populates the delivery day; a label ending earlier
 *    means the scheduler changed behaviour.
 *  - An EMPTY file is only acceptable when our API sync also shows no driver
 *    with engine time in the window (a genuinely quiet day). Empty + API shows
 *    driving = the batch had not run yet when Motive built the file.
 */
export async function scheduledFileRejection(
  clerkOrgId: string,
  window: SubjectWindow,
  rowCount: number
): Promise<string | null> {
  if (!window.trimmedDeliveryDate) {
    return `label ${window.labelStart}..${window.labelEnd} does not end on the delivery date`;
  }
  if (rowCount === 0) {
    const prisma = getAppPrisma();
    const apiActive = await prisma.motiveDriverUtilization.count({
      where: {
        clerkOrgId,
        date: { gte: window.windowStart, lte: window.windowEnd },
        OR: [{ drivingTime: { gt: 0 } }, { idleTime: { gt: 0 } }],
      },
    });
    if (apiActive > 0) {
      return `empty file but API shows ${apiActive} driver-day(s) with engine time in ${window.windowStart}..${window.windowEnd}; Motive batch likely not complete at delivery`;
    }
  }
  return null;
}

/** "...scheduled by Wolverine Administrator from WOLVERINE PACKING COMPANY is..." → company */
export function companyFromBodyPreview(preview: string): string | null {
  const m = preview.match(/scheduled by .+? from (.+?) is\b/i);
  return m ? m[1].trim() : null;
}

export async function ingestMotiveReportMailbox(
  opts: { lookbackDays?: number; dryRun?: boolean } = {}
): Promise<MailboxIngestSummary> {
  const started = Date.now();
  const mailbox = config.motiveReportMailbox;
  const summary: MailboxIngestSummary = {
    mailbox, scanned: 0, ingested: 0, unverified: 0, duplicates: 0, failed: 0, unrouted: 0, duration: 0, emails: [],
  };
  if (!mailbox || !config.microsoftGraph) {
    summary.skippedReason = !mailbox
      ? 'MOTIVE_REPORT_MAILBOX not set'
      : 'Microsoft Graph not configured';
    summary.duration = Date.now() - started;
    return summary;
  }

  const prisma = getAppPrisma();
  const accounts = await prisma.telematicsProviderAccount.findMany({
    where: { provider: TelematicsProvider.MOTIVE, status: TelematicsProviderStatus.ACTIVE },
    select: { clerkOrgId: true, motiveReportCompanyName: true },
  });
  const orgByCompany = new Map<string, string>();
  for (const a of accounts) {
    if (a.motiveReportCompanyName) orgByCompany.set(a.motiveReportCompanyName.trim().toLowerCase(), a.clerkOrgId);
  }

  const sinceIso = new Date(Date.now() - (opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 86_400_000).toISOString();
  const messages = await listMailMessages(config.microsoftGraph, mailbox, {
    sinceIso, fromAddress: MOTIVE_NOTIFICATIONS_SENDER, top: 50, maxPages: 4,
  });

  // Oldest first so a backlog lands in chronological order.
  messages.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));

  for (const msg of messages) {
    if (!REPORT_SUBJECT_RE.test(msg.subject)) continue;
    summary.scanned++;
    const entry: IngestedEmail = {
      messageId: msg.internetMessageId ?? msg.id,
      subject: msg.subject,
      receivedAt: msg.receivedDateTime,
      status: 'error',
      clerkOrgId: null,
      companyName: companyFromBodyPreview(msg.bodyPreview),
      window: null,
      rowCount: 0,
      unmatchedDriverNames: [],
    };
    summary.emails.push(entry);

    try {
      const sourceRef = msg.internetMessageId ?? `graph:${msg.id}`;
      const already = await prisma.motiveReportIngest.findUnique({ where: { sourceRef }, select: { id: true } });
      if (already) { entry.status = 'duplicate'; summary.duplicates++; continue; }

      const clerkOrgId = entry.companyName ? orgByCompany.get(entry.companyName.toLowerCase()) ?? null : null;
      if (!clerkOrgId) {
        entry.status = 'unrouted';
        entry.error = entry.companyName
          ? `No active Motive account has motive_report_company_name = "${entry.companyName}"`
          : 'Could not read company name from email body';
        summary.unrouted++;
        continue;
      }
      entry.clerkOrgId = clerkOrgId;

      const window = windowFromSubject(msg.subject, new Date(msg.receivedDateTime));
      if (!window) { entry.status = 'no_window'; entry.error = 'No date range in subject'; summary.failed++; continue; }
      entry.window = { start: window.windowStart, end: window.windowEnd, granularity: window.granularity };

      if (!msg.hasAttachments) { entry.status = 'no_attachment'; entry.error = 'Email has no attachment'; summary.failed++; continue; }
      const attachments = await getMailAttachments(config.microsoftGraph, mailbox, msg.id);
      const csv = attachments.find((a) => a.contentBytes && /\.csv$/i.test(a.name));
      if (!csv?.contentBytes) { entry.status = 'no_attachment'; entry.error = 'No CSV file attachment'; summary.failed++; continue; }

      const text = Buffer.from(csv.contentBytes, 'base64').toString('utf8');
      const parsed = parseDriverFuelPerformanceCsv(text);
      entry.rowCount = parsed.rows.length;

      const rejection = await scheduledFileRejection(clerkOrgId, window, parsed.rows.length);
      if (rejection) entry.error = rejection;

      if (opts.dryRun) {
        entry.status = rejection ? 'unverified' : 'ingested';
        if (rejection) summary.unverified++; else summary.ingested++;
        continue;
      }

      const stored = await storeReport({
        status: rejection ? MotiveReportIngestStatus.UNVERIFIED : MotiveReportIngestStatus.ACCEPTED,
        statusReason: rejection,
        labelStart: window.labelStart,
        labelEnd: window.labelEnd,
        clerkOrgId,
        source: MotiveReportSource.SCHEDULED_EMAIL,
        sourceRef,
        reportName: msg.subject.match(/Your (.+?) Report for/i)?.[1] ?? null,
        subject: msg.subject,
        attachmentName: csv.name,
        receivedAt: new Date(msg.receivedDateTime),
        window,
        rawCsv: text,
        rows: parsed.rows,
      });
      entry.unmatchedDriverNames = stored.unmatchedDriverNames;
      if (stored.alreadyIngested) { entry.status = 'duplicate'; summary.duplicates++; }
      else if (rejection) { entry.status = 'unverified'; summary.unverified++; }
      else { entry.status = 'ingested'; summary.ingested++; }
    } catch (err: any) {
      entry.status = err instanceof ReportParseError ? 'parse_error' : 'error';
      entry.error = err?.message ?? String(err);
      summary.failed++;
      console.error(`[motive-report] ${entry.status} for "${msg.subject}": ${entry.error}`);
    }
  }

  summary.duration = Date.now() - started;
  return summary;
}
