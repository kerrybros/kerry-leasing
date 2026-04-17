/**
 * MICROSOFT GRAPH CLIENT
 * App-only (client credentials) access to SharePoint drive items.
 * Uses raw fetch — no @azure/identity or Graph SDK dependency.
 * Token is cached in-process and refreshed when it expires.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
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
