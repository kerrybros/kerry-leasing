/**
 * WHIP AROUND API CLIENT
 * HTTP client for the Whip Around public v4 API.
 * Supports cursor pagination (inspections) and classic page pagination (defects).
 * Mirrors the retry + typed-error pattern used by MotiveClient / SamsaraClient.
 */

import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.whip-around.com/api/public/v4';
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Typed errors (same shape as telematics/errors.ts but for Whip Around)
// ---------------------------------------------------------------------------

export class WhiparoundAuthError extends Error {
  readonly statusCode = 401;
  constructor(public readonly path: string) {
    super(`Whip Around API authentication failed (HTTP 401 on ${path}). Check the API key.`);
    this.name = 'WhiparoundAuthError';
  }
}

export class WhiparoundRateLimitError extends Error {
  readonly statusCode = 429;
  constructor() {
    super('Whip Around API rate limit exceeded (HTTP 429)');
    this.name = 'WhiparoundRateLimitError';
  }
}

export class WhiparoundServerError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Whip Around API server error (HTTP ${statusCode})`);
    this.name = 'WhiparoundServerError';
  }
}

export class WhiparoundTimeoutError extends Error {
  constructor() {
    super('Whip Around API request timeout — no response received');
    this.name = 'WhiparoundTimeoutError';
  }
}

function isTransient(err: unknown): boolean {
  return (
    err instanceof WhiparoundRateLimitError ||
    err instanceof WhiparoundServerError ||
    err instanceof WhiparoundTimeoutError
  );
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface CursorMeta {
  next_cursor: string | null;
  previous_cursor: string | null;
  result_count: number;
}

export interface CursorPage<T> {
  data: T[];
  meta: CursorMeta;
}

export interface ClassicPagination {
  current_page: number;
  per_page: number;
  total: number;
}

export interface ClassicPage<T> {
  data: T[];
  pagination: ClassicPagination;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WhiparoundClient {
  private http: AxiosInstance;

  constructor(apiKey: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.http.interceptors.response.use(
      (r) => r,
      (error) => {
        const path: string =
          typeof error.config?.url === 'string' ? error.config.url : 'unknown';

        if (error.response) {
          const { status, data } = error.response;
          if (status === 401) throw new WhiparoundAuthError(path);
          if (status === 429) throw new WhiparoundRateLimitError();
          if (status >= 500) throw new WhiparoundServerError(status);
          throw new Error(
            `Whip Around API error on ${path}: ${data?.message ?? `HTTP ${status}`}`
          );
        }
        if (error.request) throw new WhiparoundTimeoutError();
        throw new Error(`Whip Around API request failed: ${error.message}`);
      }
    );
  }

  // -------------------------------------------------------------------------
  // Cursor-paginated fetch (inspections)
  // Exhausts all pages and returns every record.
  // -------------------------------------------------------------------------
  async getAllCursor<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | null = null;

    do {
      const reqParams: Record<string, unknown> = { ...params, limit: 1000 };
      if (cursor) reqParams.cursor = cursor;

      const page = await this.withRetry(() =>
        this.http.get<CursorPage<T>>(endpoint, { params: reqParams })
      );

      const { data, meta } = page.data;
      if (Array.isArray(data)) results.push(...data);
      cursor = meta?.next_cursor ?? null;

      if (cursor) await this.sleep(300);
    } while (cursor);

    return results;
  }

  // -------------------------------------------------------------------------
  // Single cursor page (used when caller manages pagination)
  // -------------------------------------------------------------------------
  async getCursorPage<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<CursorPage<T>> {
    const res = await this.withRetry(() =>
      this.http.get<CursorPage<T>>(endpoint, { params })
    );
    return res.data;
  }

  // -------------------------------------------------------------------------
  // Classic page-based fetch (defects)
  // Exhausts all pages. Handles Whip Around's pagination object, Laravel-style
  // last_page, or falls back to "full page => fetch next" when meta is missing.
  // -------------------------------------------------------------------------
  async getAllClassic<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const pageLimit = 100;
    const maxPages = 5000;
    const results: T[] = [];
    let page = 1;

    while (page <= maxPages) {
      const res = await this.withRetry(() =>
        this.http.get(endpoint, {
          params: { ...params, page, limit: pageLimit },
        })
      );

      const body = res.data as Record<string, unknown>;
      const data = body.data;
      if (!Array.isArray(data) || data.length === 0) break;

      results.push(...(data as T[]));

      const pag = (body.pagination ?? body.meta) as
        | (ClassicPagination & { last_page?: number })
        | undefined;
      let hasMore = false;

      if (pag && typeof pag.last_page === 'number' && typeof pag.current_page === 'number') {
        hasMore = pag.current_page < pag.last_page;
      } else if (
        pag &&
        typeof pag.total === 'number' &&
        typeof pag.per_page === 'number' &&
        pag.per_page > 0
      ) {
        const totalPages = Math.ceil(pag.total / pag.per_page);
        const current = pag.current_page ?? page;
        hasMore = current < totalPages;
      } else {
        // API omitted pagination or unknown shape — if we filled a page, keep going
        hasMore = data.length >= pageLimit;
      }

      if (!hasMore) break;
      page++;
      await this.sleep(300);
    }

    if (page > maxPages) {
      console.warn(
        `[WhipAround] getAllClassic: safety cap ${maxPages} pages reached for ${endpoint} (${results.length} rows)`
      );
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Single classic page
  // -------------------------------------------------------------------------
  async getClassicPage<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<ClassicPage<T>> {
    const res = await this.withRetry(() =>
      this.http.get<ClassicPage<T>>(endpoint, { params })
    );
    return res.data;
  }

  // -------------------------------------------------------------------------
  // Connection test — hits assets with limit=1
  // -------------------------------------------------------------------------
  async testConnection(): Promise<boolean> {
    try {
      await this.http.get('/assets', { params: { limit: 1 } });
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Retry wrapper
  // -------------------------------------------------------------------------
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isTransient(err) || attempt === MAX_RETRIES) throw err;
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `[WhipAround] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
            `retrying in ${delay}ms: ${(err as Error).message}`
        );
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
