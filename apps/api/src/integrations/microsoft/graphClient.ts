/**
 * MICROSOFT GRAPH CLIENT
 * App-only (client credentials) access to SharePoint drive items.
 * Uses raw fetch — no @azure/identity or Graph SDK dependency.
 * Token is cached in-process and refreshed when it expires.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';
const TOKEN_REFRESH_BUFFER_MS = 60_000; // Refresh 60 s before expiry

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size: number | null;
  lastModifiedDateTime: string | null;
  isFolder: boolean;
}

interface GraphDriveItemRaw {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: object;
  file?: object;
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

// ---------------------------------------------------------------------------
// Token cache (in-memory, per process)
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAtMs: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - TOKEN_REFRESH_BUFFER_MS > now) {
    return tokenCache.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => 'unknown');
    throw new Error(`Graph token acquisition failed (${resp.status}): ${text}`);
  }

  const json = await resp.json() as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

// ---------------------------------------------------------------------------
// Graph fetch helper
// ---------------------------------------------------------------------------

async function graphFetch<T>(url: string, token: string): Promise<T> {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = body?.error?.message ?? resp.statusText;
    throw new Error(`Graph request failed (${resp.status}) [${url}]: ${msg}`);
  }

  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Site + drive resolution (cached per process, they don't change at runtime)
// ---------------------------------------------------------------------------

interface SiteInfo {
  id: string;
}

interface DriveInfo {
  id: string;
  webUrl: string;
}

let cachedSiteId: string | null = null;
let cachedDriveId: string | null = null;
let cachedDriveWebUrl: string | null = null;

async function resolveSiteId(
  token: string,
  siteHostname: string,
  sitePath: string
): Promise<string> {
  if (cachedSiteId) return cachedSiteId;

  // Normalize: strip leading slash from sitePath for the URL
  const cleanPath = sitePath.replace(/^\//, '');
  const url = `${GRAPH_BASE}/sites/${siteHostname}:/${cleanPath}`;
  const site = await graphFetch<SiteInfo>(url, token);
  cachedSiteId = site.id;
  return site.id;
}

async function resolveDriveId(token: string, siteId: string): Promise<{ id: string; webUrl: string }> {
  if (cachedDriveId && cachedDriveWebUrl) {
    return { id: cachedDriveId, webUrl: cachedDriveWebUrl };
  }

  const url = `${GRAPH_BASE}/sites/${siteId}/drive`;
  const drive = await graphFetch<DriveInfo>(url, token);
  cachedDriveId = drive.id;
  cachedDriveWebUrl = drive.webUrl;
  return { id: drive.id, webUrl: drive.webUrl };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ListDriveItemsResult {
  items: DriveItem[];
  nextPage: string | null;
  driveWebUrl: string;
}

export interface GraphClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteHostname: string;
  sitePath: string;
}

function mapItem(raw: GraphDriveItemRaw): DriveItem {
  return {
    id: raw.id,
    name: raw.name,
    webUrl: raw.webUrl,
    size: raw.size ?? null,
    lastModifiedDateTime: raw.lastModifiedDateTime ?? null,
    isFolder: Boolean(raw.folder),
  };
}

// ---------------------------------------------------------------------------
// Preview (embed URL)
// ---------------------------------------------------------------------------

export interface PreviewResult {
  embedUrl: string;
}

interface GraphPreviewResponse {
  getUrl?: string;
  postUrl?: string;
}

export async function getItemPreviewUrl(
  cfg: GraphClientConfig,
  itemId: string
): Promise<PreviewResult> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const url = `${GRAPH_BASE}/drives/${drive.id}/items/${itemId}/preview`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = body?.error?.message ?? resp.statusText;
    throw new Error(`Graph preview failed (${resp.status}) [${url}]: ${msg}`);
  }

  const data = await resp.json() as GraphPreviewResponse;
  if (!data.getUrl) {
    throw new Error('Graph preview response did not include a getUrl');
  }

  return { embedUrl: data.getUrl };
}

// ---------------------------------------------------------------------------
// Workbook reads (Excel files via Graph)
// ---------------------------------------------------------------------------

export interface Worksheet {
  id: string;
  name: string;
  position: number;
  visibility: string;
}

export interface UsedRange {
  address: string;
  rowCount: number;
  columnCount: number;
  values: unknown[][];
  text: string[][];
}

export async function listWorksheets(
  cfg: GraphClientConfig,
  itemId: string
): Promise<Worksheet[]> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const url = `${GRAPH_BASE}/drives/${drive.id}/items/${itemId}/workbook/worksheets`;
  const resp = await graphFetch<GraphListResponse<Worksheet>>(url, token);
  return resp.value;
}

export interface CellFormat {
  fill: string | null;       // hex (e.g. "#FFFF00") or null when no/default fill
  fontColor: string | null;  // hex or null when default (black)
  fontBold: boolean;
}

interface GraphCellProperty {
  format?: {
    fill?: { color?: string } | null;
    font?: { color?: string; bold?: boolean } | null;
  } | null;
}

interface GraphCellPropertiesResponse {
  value: GraphCellProperty[][];
}

function normalizeFillColor(color: string | undefined | null): string | null {
  if (!color) return null;
  const stripped = color.replace('#', '').toUpperCase();
  if (!stripped || stripped === 'FFFFFF') return null;
  return color.startsWith('#') ? color : `#${color}`;
}

function normalizeFontColor(color: string | undefined | null): string | null {
  if (!color) return null;
  const stripped = color.replace('#', '').toUpperCase();
  if (!stripped || stripped === '000000') return null;
  return color.startsWith('#') ? color : `#${color}`;
}

/**
 * Returns per-cell formatting (fill color, font color, bold) for a range.
 * Pass the cell-range portion of an address (e.g. "A1:E84"), not the full
 * "Sheet!A1:E84" form — the worksheet is already in the URL path.
 */
export async function getCellProperties(
  cfg: GraphClientConfig,
  itemId: string,
  worksheetName: string,
  cellRange: string
): Promise<CellFormat[][]> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const encodedName = encodeURIComponent(worksheetName);
  const encodedRange = encodeURIComponent(cellRange);
  // /beta — getCellProperties isn't reliably wired up in v1.0 yet (returns
  // "Resource not found for the segment" on many tenants).
  const url = `${GRAPH_BETA}/drives/${drive.id}/items/${itemId}/workbook/worksheets('${encodedName}')/range(address='${encodedRange}')/getCellProperties`;

  const body = {
    cellPropertiesLoadOptions: {
      format: {
        fill: { color: true },
        font: { color: true, bold: true },
      },
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = errBody?.error?.message ?? resp.statusText;
    throw new Error(`Graph getCellProperties failed (${resp.status}): ${msg}`);
  }

  const data = (await resp.json()) as GraphCellPropertiesResponse;
  return (data.value ?? []).map((row) =>
    row.map((cell) => ({
      fill: normalizeFillColor(cell.format?.fill?.color),
      fontColor: normalizeFontColor(cell.format?.font?.color),
      fontBold: Boolean(cell.format?.font?.bold),
    }))
  );
}

export async function getUsedRange(
  cfg: GraphClientConfig,
  itemId: string,
  worksheetName: string
): Promise<UsedRange> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const encoded = encodeURIComponent(worksheetName);
  const url = `${GRAPH_BASE}/drives/${drive.id}/items/${itemId}/workbook/worksheets('${encoded}')/usedRange?$select=address,rowCount,columnCount,values,text`;
  return graphFetch<UsedRange>(url, token);
}

/**
 * Downloads the raw bytes of a drive item (e.g. an .xlsx/.xlsm file) so they
 * can be parsed locally with a library like exceljs. One Graph call.
 */
export async function getDriveItemContent(
  cfg: GraphClientConfig,
  itemId: string
): Promise<Buffer> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const url = `${GRAPH_BASE}/drives/${drive.id}/items/${itemId}/content`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => 'unknown');
    throw new Error(`Graph content download failed (${resp.status}): ${text}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Mail (send email as an app mailbox)
// ---------------------------------------------------------------------------

export interface SendMailInput {
  from: string; // sender mailbox UPN/address, e.g. reports@kerrybros.com
  to: string;
  subject: string;
  text: string; // plain-text body (used as content when html is omitted)
  html?: string; // optional HTML body
  replyTo?: string;
}

/**
 * Sends an email as `from` via Graph (POST /users/{from}/sendMail). Requires the
 * app registration to hold the Mail.Send APPLICATION permission, and `from` to
 * be a real mailbox in the tenant. Graph returns 202 Accepted (no body) on success.
 */
export async function sendMail(cfg: GraphClientConfig, input: SendMailInput): Promise<void> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(input.from)}/sendMail`;
  const message: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: input.html ? 'HTML' : 'Text',
      content: input.html ?? input.text,
    },
    toRecipients: [{ emailAddress: { address: input.to } }],
  };
  if (input.replyTo) {
    message.replyTo = [{ emailAddress: { address: input.replyTo } }];
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: false }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => 'unknown');
    throw new Error(`Graph sendMail failed (${resp.status}): ${text}`);
  }
}

export async function listDriveItems(
  cfg: GraphClientConfig,
  folderPath: string | null,
  nextLink: string | null
): Promise<ListDriveItemsResult> {
  const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSiteId(token, cfg.siteHostname, cfg.sitePath);
  const drive = await resolveDriveId(token, siteId);

  const SELECT = 'name,webUrl,size,lastModifiedDateTime,folder,file,id';
  const ORDERBY = 'name asc';

  let url: string;
  if (nextLink) {
    // Relay an existing nextLink from Graph verbatim
    url = nextLink;
  } else if (folderPath) {
    // Encode each segment but keep slashes
    const encoded = folderPath
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    url = `${GRAPH_BASE}/drives/${drive.id}/root:/${encoded}:/children?$select=${SELECT}&$orderby=${ORDERBY}`;
  } else {
    url = `${GRAPH_BASE}/drives/${drive.id}/root/children?$select=${SELECT}&$orderby=${ORDERBY}`;
  }

  const page = await graphFetch<GraphListResponse<GraphDriveItemRaw>>(url, token);

  const raw = page.value ?? [];
  // Folders first, then files (Graph's $orderby only sorts by name; we re-sort client-side)
  const sorted = [
    ...raw.filter((i) => i.folder).map(mapItem),
    ...raw.filter((i) => !i.folder).map(mapItem),
  ];

  return {
    items: sorted,
    nextPage: page['@odata.nextLink'] ?? null,
    driveWebUrl: drive.webUrl,
  };
}
