/**
 * SAMSARA API CLIENT
 * HTTP client wrapper for Samsara API with typed errors, retry, and pagination
 */

import axios, { AxiosInstance } from 'axios';
import {
  TelematicsAuthError,
  TelematicsRateLimitError,
  TelematicsServerError,
  TelematicsTimeoutError,
  isTransientError,
} from '../errors.js';

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

export class SamsaraClient {
  private client: AxiosInstance;
  private apiToken: string;
  private baseURL = 'https://api.samsara.com';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const path =
          typeof error.config?.url === 'string'
            ? error.config.url
            : 'unknown';

        if (error.response) {
          const status = error.response.status;
          if (status === 401) {
            throw new TelematicsAuthError('SAMSARA', path);
          } else if (status === 429) {
            throw new TelematicsRateLimitError('SAMSARA');
          } else if (status >= 500) {
            throw new TelematicsServerError('SAMSARA', status);
          } else {
            throw new Error(
              `Samsara API error on ${path}: ${error.response.data?.message || `HTTP ${status}`}`
            );
          }
        } else if (error.request) {
          throw new TelematicsTimeoutError('SAMSARA');
        } else {
          throw new Error(`Samsara API request failed: ${error.message}`);
        }
      }
    );
  }

  /**
   * GET with cursor-based pagination. Retries transient errors up to MAX_RETRIES.
   */
  async get<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T[]> {
    const allResults: T[] = [];
    let hasMore = true;
    let after: string | undefined = undefined;

    while (hasMore) {
      const requestParams: Record<string, any> = {
        ...params,
        limit: params.limit ?? 512
      };

      if (after) {
        requestParams.after = after;
      }

      const response = await this.withRetry(() =>
        this.client.get(endpoint, { params: requestParams })
      );

      const data = response.data;

      if (data.data && Array.isArray(data.data)) {
        allResults.push(...data.data);
      }

      if (data.pagination) {
        hasMore = data.pagination.hasNextPage === true;
        after = data.pagination.endCursor;
      } else {
        hasMore = false;
      }

      if (hasMore) {
        await this.sleep(500);
      }
    }

    return allResults;
  }

  async getSinglePage<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<{ data: T[]; pagination?: any }> {
    const response = await this.withRetry(() =>
      this.client.get(endpoint, { params: { ...params, limit: 512 } })
    );
    return response.data;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/fleet/vehicles', { params: { limit: 1 } });
      return true;
    } catch (error) {
      console.error('Samsara API connection test failed:', error);
      return false;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (!isTransientError(err) || attempt === MAX_RETRIES) {
          throw err;
        }
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `[Samsara] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
          `retrying in ${delayMs}ms: ${(err as Error).message}`
        );
        await this.sleep(delayMs);
      }
    }
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
