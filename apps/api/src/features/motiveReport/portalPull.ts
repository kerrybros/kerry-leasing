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
 * Session: the org's dedicated portal user signs in over plain HTTP against the
 * same Rails login form the dashboard uses (credentials live in the org's
 * encrypted credentials blob as portalEmail / portalPassword). The resulting
 * `auth_token` cookie is then sent as X-Web-User-Auth, exactly as the dashboard
 * does. Nothing is cached between runs.
 *
 * This deliberately does NOT drive a browser. A headless Chromium worked on a
 * laptop but hung silently on Render's 512 MB cron instance, and it added a
 * ~100 MB dependency to every service's build. The login is three requests, so
 * the browser bought nothing. If Motive ever puts a JavaScript challenge in
 * front of this form, the fallback is a hosted browser session, not a local
 * Chromium.
 *
 * Risk, stated once: this is Motive's internal web API, not the documented
 * public API. It can change without notice; the strict CSV parser and the
 * driver-presence check turn any such change into a loud failure, not bad data.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveReportIngestStatus, MotiveReportSource, TelematicsProvider, TelematicsProviderStatus } from '../../generated/app-client/index.js';
import { portalRowsToCsv, type PortalDriverRow, type PortalReportPage } from './portalCsv.js';
import { parseDriverFuelPerformanceCsv } from './parseDriverFuelPerformanceCsv.js';
import { classifyWindow, addDays, ymdInEastern } from './reportWindow.js';
import { storeReport } from './reportStore.js';

const LOGIN_PAGE = 'https://account.gomotive.com/log-in';
const RETURN_URL = 'https://app.gomotive.com/';
const REPORT_URL = 'https://api.keeptruckin.com/api/w3/reports/driver_fuel_performance';
const LOGIN_TIMEOUT_MS = 45_000;
const MAX_REDIRECTS = 6;
/** Sent on the login requests so the form behaves as it does for a real browser. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Login (plain HTTP against the dashboard's own Rails form)
// ---------------------------------------------------------------------------

/** Minimal cookie jar: name to value, which is all this two-hop flow needs. */
class CookieJar {
  private jar = new Map<string, string>();
  absorb(headers: Headers): void {
    const set = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const raw of set) {
      const pair = String(raw).split(';', 1)[0];
      const eq = pair.indexOf('=');
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name: string): string | undefined {
    return this.jar.get(name);
  }
}

function extractCsrfToken(html: string): string | null {
  return (
    html.match(/name="authenticity_token"[^>]*value="([^"]+)"/)?.[1] ??
    html.match(/value="([^"]+)"[^>]*name="authenticity_token"/)?.[1] ??
    null
  );
}

/** Sign in and return the session token the dashboard sends as X-Web-User-Auth. */
export async function portalLogin(email: string, password: string): Promise<string> {
  const jar = new CookieJar();
  const signal = AbortSignal.timeout(LOGIN_TIMEOUT_MS);
  const loginUrl = `${LOGIN_PAGE}?return_url=${encodeURIComponent(RETURN_URL)}`;

  const page = await fetch(loginUrl, { redirect: 'manual', headers: { 'User-Agent': BROWSER_UA }, signal });
  jar.absorb(page.headers);
  if (!page.ok) throw new Error(`Motive login page returned HTTP ${page.status}`);
  const html = await page.text();
  const csrf = extractCsrfToken(html);
  if (!csrf) {
    throw new Error('Motive login page carried no authenticity_token. The sign-in form has changed.');
  }

  const body = new URLSearchParams({
    utf8: '\u2713',
    authenticity_token: csrf,
    'user[email]': email,
    'user[password]': password,
    return_url: RETURN_URL,
    ref: '',
  });

  let url = `${LOGIN_PAGE}?ref=sign-up`;
  let resp = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.header(),
      'User-Agent': BROWSER_UA,
      Referer: loginUrl,
    },
    body: body.toString(),
    signal,
  });
  jar.absorb(resp.headers);

  // A rejected sign-in re-renders the form (200) instead of redirecting away.
  if (resp.status === 200) {
    const text = await resp.text();
    const reason = /invalid|incorrect|does not match/i.test(text)
      ? 'credentials were rejected'
      : 'the form was re-rendered without redirecting';
    throw new Error(`Motive login failed: ${reason}.`);
  }

  for (let hop = 0; hop < MAX_REDIRECTS && resp.status >= 300 && resp.status < 400; hop++) {
    const location = resp.headers.get('location');
    if (!location) break;
    url = new URL(location, url).toString();
    resp = await fetch(url, { redirect: 'manual', headers: { Cookie: jar.header(), 'User-Agent': BROWSER_UA }, signal });
    jar.absorb(resp.headers);
    if (jar.get('auth_token')) break;
  }

  const token = jar.get('auth_token');
  if (!token) {
    throw new Error(`Motive login produced no session cookie (last URL ${url}, status ${resp.status}).`);
  }
  return decodeURIComponent(token);
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
