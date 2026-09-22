/**
 * MOTIVE PORTAL PULL
 *
 * Pulls the Fleet Dashboard "Driver Fuel Performance" report directly, for
 * exact date windows, using the same internal endpoint the dashboard calls.
 * This exists because Motive's scheduled-report emails cannot target a
 * calendar week and are built from a nightly batch that keeps adding drivers
 * to a day for several days afterwards (observed 2026-09-13..18). Pulling a
 * window again later picks up those late arrivals; every pull upserts the
 * window's rows and keeps the raw file as an audit record.
 *
 * Session: a headless Chromium logs in as the org's dedicated portal user
 * (credentials in the org's encrypted credentials blob: portalEmail /
 * portalPassword), the `auth_token` cookie is read, the browser is closed,
 * and the report is fetched with plain HTTP using the X-Web-User-Auth header
 * (as the dashboard does). Nothing is cached between runs.
 *
 * Risk, stated once: this is Motive's internal web API, not the documented
 * public API. It can change without notice; the strict CSV parser and the
 * driver-presence check turn any such change into a loud failure, not bad data.
 */

import puppeteer, { type Browser } from 'puppeteer-core';
import { getAppPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveReportIngestStatus, MotiveReportSource, TelematicsProvider, TelematicsProviderStatus } from '../../generated/app-client/index.js';
import { portalRowsToCsv, type PortalDriverRow, type PortalReportPage } from './portalCsv.js';
import { parseDriverFuelPerformanceCsv } from './parseDriverFuelPerformanceCsv.js';
import { classifyWindow, addDays, ymdInEastern } from './reportWindow.js';
import { storeReport } from './reportStore.js';

const LOGIN_URL = 'https://app.gomotive.com/';
const REPORT_URL = 'https://api.keeptruckin.com/api/w3/reports/driver_fuel_performance';
const LOGIN_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Browser launch: serverless Chromium on Linux (Render), local Chrome elsewhere
// ---------------------------------------------------------------------------

async function launchBrowser(): Promise<Browser> {
  const explicit = process.env.MOTIVE_PORTAL_CHROME_PATH;
  if (process.platform === 'linux' && !explicit) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath =
    explicit ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome');
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
}

/** Log in and return the session token the dashboard sends as X-Web-User-Auth. */
export async function portalLogin(email: string, password: string): Promise<string> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS });

    // Login form (account.gomotive.com/log-in, probed 2026-09-18): a plain Rails
    // form with #user_email, #user_password and #sign-in-button. The page also
    // carries hidden privacy-modal email inputs, so target by id, never by type.
    const emailSel = '#user_email';
    const passSel = '#user_password';
    const submitSel = '#sign-in-button';
    await page.waitForSelector(emailSel, { timeout: LOGIN_TIMEOUT_MS });
    await page.type(emailSel, email, { delay: 15 });
    await page.type(passSel, password, { delay: 15 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS }).catch(() => undefined),
      page.click(submitSel),
    ]);

    // Wait until the app has set its session cookie (may take a redirect or two).
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const cookies = await page.cookies('https://app.gomotive.com/');
      const tok = cookies.find((c) => c.name === 'auth_token')?.value;
      if (tok) return decodeURIComponent(tok);
      const url = page.url();
      if (/alert=|error|invalid/i.test(url)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const bodyText = String(await page.evaluate('document.body ? document.body.innerText : ""')).slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`Motive portal login did not produce a session (url=${page.url()}; page says: "${bodyText}")`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Report fetch
// ---------------------------------------------------------------------------

export async function fetchPortalReport(token: string, startDate: string, endDate: string): Promise<PortalDriverRow[]> {
  const all: PortalDriverRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${REPORT_URL}?page_no=${page}&per_page=100&start_date=${startDate}&end_date=${endDate}`;
    const resp = await fetch(url, { headers: { 'X-Web-User-Auth': token, Accept: 'application/json' } });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Motive portal report ${startDate}..${endDate} page ${page}: HTTP ${resp.status} ${text.slice(0, 200)}`);
    }
    const body = (await resp.json()) as PortalReportPage;
    if (!Array.isArray(body.details)) throw new Error(`Motive portal report: unexpected shape (keys ${Object.keys(body).join(',')})`);
    all.push(...body.details);
    const total = body.total ?? all.length;
    if (body.details.length === 0 || all.length >= total) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Window plan
// ---------------------------------------------------------------------------

export interface PullWindow { windowStart: string; windowEnd: string }

/**
 * Windows to (re)pull on a given run day, all ending on or before yesterday:
 *  - each of the last `dailyLookback` days individually (drivers page + Sunday tile)
 *  - the last `weeks` completed Monday..Sunday weeks (scorecard + weekly report)
 *  - the prior calendar month and the current month to date (month-end report)
 * Re-pulling the same windows nightly is what captures Motive's late additions.
 */
export function planPullWindows(todayEt: string, opts: { dailyLookback?: number; weeks?: number } = {}): PullWindow[] {
  const yesterday = addDays(todayEt, -1);
  const out: PullWindow[] = [];
  const daily = opts.dailyLookback ?? 14;
  for (let i = 0; i < daily; i++) {
    const d = addDays(yesterday, -i);
    out.push({ windowStart: d, windowEnd: d });
  }
  // Most recent completed Sunday on/before yesterday.
  const [y, m, d] = yesterday.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  let sunday = addDays(yesterday, -dow);
  for (let i = 0; i < (opts.weeks ?? 2); i++) {
    out.push({ windowStart: addDays(sunday, -6), windowEnd: sunday });
    sunday = addDays(sunday, -7);
  }
  const monthStart = `${todayEt.slice(0, 7)}-01`;
  if (yesterday >= monthStart) out.push({ windowStart: monthStart, windowEnd: yesterday });
  const priorMonthEnd = addDays(monthStart, -1);
  out.push({ windowStart: `${priorMonthEnd.slice(0, 7)}-01`, windowEnd: priorMonthEnd });
  return out;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface PulledWindowResult {
  windowStart: string;
  windowEnd: string;
  status: 'stored' | 'unverified' | 'error';
  rowCount: number;
  driversInReport: number;
  driversActiveInApi: number;
  missingFromReport: string[];
  error?: string;
}

export interface OrgPullResult {
  clerkOrgId: string;
  success: boolean;
  windows: PulledWindowResult[];
  error?: string;
  duration: number;
}

export interface PortalPullSummary {
  totalOrgs: number;
  successCount: number;
  errorCount: number;
  results: OrgPullResult[];
  duration: number;
}

/**
 * Presence check: every driver our API sync saw with engine time in the window
 * should appear in the report. Missing drivers mean Motive's batch has not
 * caught up yet; the window is stored UNVERIFIED and re-pulled next run.
 */
async function driversMissingFromReport(clerkOrgId: string, w: PullWindow, reportNames: Set<string>): Promise<{ active: number; missing: string[] }> {
  const prisma = getAppPrisma();
  const rows = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId, date: { gte: w.windowStart, lte: w.windowEnd }, OR: [{ drivingTime: { gt: 0 } }, { idleTime: { gt: 0 } }] },
    select: { driverFirstName: true, driverLastName: true },
    distinct: ['driverId'],
  });
  const missing: string[] = [];
  for (const r of rows) {
    const name = `${r.driverFirstName ?? ''} ${r.driverLastName ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
    if (name && !reportNames.has(name)) missing.push(name);
  }
  return { active: rows.length, missing: missing.sort() };
}

export async function pullOrg(clerkOrgId: string, email: string, password: string, windows: PullWindow[], opts: { dryRun?: boolean } = {}): Promise<OrgPullResult> {
  const started = Date.now();
  const result: OrgPullResult = { clerkOrgId, success: false, windows: [], duration: 0 };
  let token: string;
  try {
    token = await portalLogin(email, password);
  } catch (e: any) {
    result.error = e?.message ?? String(e);
    result.duration = Date.now() - started;
    return result;
  }
  const pulledAt = new Date();
  for (const w of windows) {
    const entry: PulledWindowResult = { ...w, status: 'error', rowCount: 0, driversInReport: 0, driversActiveInApi: 0, missingFromReport: [] };
    result.windows.push(entry);
    try {
      const details = await fetchPortalReport(token, w.windowStart, w.windowEnd);
      const csv = portalRowsToCsv(details);
      const parsed = parseDriverFuelPerformanceCsv(csv);
      entry.rowCount = parsed.rows.length;
      entry.driversInReport = details.length;
      const names = new Set(parsed.rows.map((r) => r.driverNormalizedName));
      const presence = await driversMissingFromReport(clerkOrgId, w, names);
      entry.driversActiveInApi = presence.active;
      entry.missingFromReport = presence.missing;
      const rejection = presence.missing.length > 0
        ? `report missing ${presence.missing.length} driver(s) the API shows active: ${presence.missing.join('; ')}`
        : null;
      if (!opts.dryRun) {
        await storeReport({
          clerkOrgId,
          source: MotiveReportSource.PORTAL_PULL,
          sourceRef: `pull:${clerkOrgId}:${w.windowStart}_${w.windowEnd}:${pulledAt.toISOString()}`,
          reportName: 'Driver Fuel Performance (portal pull)',
          attachmentName: null,
          receivedAt: pulledAt,
          window: { ...w, granularity: classifyWindow(w.windowStart, w.windowEnd) },
          rawCsv: csv,
          rows: parsed.rows,
          status: rejection ? MotiveReportIngestStatus.UNVERIFIED : MotiveReportIngestStatus.ACCEPTED,
          statusReason: rejection,
          labelStart: w.windowStart,
          labelEnd: w.windowEnd,
        });
      }
      entry.status = rejection ? 'unverified' : 'stored';
      if (rejection) entry.error = rejection;
    } catch (e: any) {
      entry.error = e?.message ?? String(e);
      console.error(`[motive-portal] ${clerkOrgId} ${w.windowStart}..${w.windowEnd}: ${entry.error}`);
    }
  }
  result.success = result.windows.every((x) => x.status !== 'error');
  result.duration = Date.now() - started;
  return result;
}

/** All active Motive orgs that have portal credentials configured. */
export async function runPortalPull(opts: { dryRun?: boolean; onlyOrgId?: string; windows?: PullWindow[] } = {}): Promise<PortalPullSummary> {
  const started = Date.now();
  const prisma = getAppPrisma();
  const accounts = await prisma.telematicsProviderAccount.findMany({
    where: { provider: TelematicsProvider.MOTIVE, status: TelematicsProviderStatus.ACTIVE, ...(opts.onlyOrgId ? { clerkOrgId: opts.onlyOrgId } : {}) },
    select: { clerkOrgId: true, credentialsJson: true },
  });
  const windows = opts.windows ?? planPullWindows(ymdInEastern(new Date()));
  const results: OrgPullResult[] = [];
  for (const a of accounts) {
    const creds = readCredentials(a.credentialsJson);
    const email = creds.portalEmail as string | undefined;
    const password = creds.portalPassword as string | undefined;
    if (!email || !password) continue; // not configured for portal pull
    results.push(await pullOrg(a.clerkOrgId, email, password, windows, opts));
  }
  return {
    totalOrgs: results.length,
    successCount: results.filter((r) => r.success).length,
    errorCount: results.filter((r) => !r.success).length,
    results,
    duration: Date.now() - started,
  };
}
