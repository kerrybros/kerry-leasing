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
  // Exhausts all pages and returns every record.
  // -------------------------------------------------------------------------
  async getAllClassic<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await this.withRetry(() =>
        this.http.get<ClassicPage<T>>(endpoint, {
          params: { ...params, page, limit: 100 },
        })
      );

      const { data, pagination } = res.data;
      if (Array.isArray(data)) results.push(...data);

      if (pagination) {
        const totalPages = Math.ceil(pagination.total / pagination.per_page);
        hasMore = page < totalPages;
        page++;
      } else {
        hasMore = false;
      }

      if (hasMore) await this.sleep(300);
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
