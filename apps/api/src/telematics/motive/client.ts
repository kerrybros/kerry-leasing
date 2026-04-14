/**
 * MOTIVE API CLIENT
 * HTTP client wrapper for Motive API with typed errors, retry, and pagination
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

export class MotiveClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL = 'https://api.gomotive.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'X-Time-Zone': 'Eastern Time (US & Canada)',
        'X-Metric-Units': 'false'
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
          const data = error.response.data;
          
          if (status === 401) {
            throw new TelematicsAuthError('MOTIVE', path);
          } else if (status === 429) {
            throw new TelematicsRateLimitError('MOTIVE');
          } else if (status >= 500) {
            throw new TelematicsServerError('MOTIVE', status);
          } else {
            throw new Error(
              `Motive API error on ${path}: ${data?.error_message || data?.message || `HTTP ${status}`}`
            );
          }
        } else if (error.request) {
          throw new TelematicsTimeoutError('MOTIVE');
        } else {
          throw new Error(`Motive API request failed: ${error.message}`);
        }
      }
    );
  }

  /**
   * GET with page-based pagination. Retries transient errors up to MAX_RETRIES.
   */
  async get<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T[]> {
    const allResults: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.withRetry(() =>
        this.client.get(endpoint, {
          params: {
            ...params,
            page_no: page,
            per_page: 100
          }
        })
      );

      const data = response.data;

      if (data.results && Array.isArray(data.results)) {
        allResults.push(...data.results);
      } else {
        const dataKey = Object.keys(data).find(key => 
          Array.isArray(data[key]) && key !== 'pagination'
        );
        
        if (dataKey && Array.isArray(data[dataKey])) {
          const records = data[dataKey];
          for (const record of records) {
            const nestedKey = Object.keys(record).find(k => k !== 'pagination' && typeof record[k] === 'object');
            if (nestedKey && record[nestedKey]) {
              allResults.push(record[nestedKey] as T);
            } else {
              allResults.push(record as T);
            }
          }
        } else {
          if (Object.keys(data).length > 0 && !data.pagination) {
            return [data as T];
          }
        }
      }

      if (data.pagination) {
        const { page_no: currentPage, per_page, total } = data.pagination;
        const totalPages = Math.ceil(total / per_page);
        hasMore = currentPage < totalPages;
        page++;
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
    params: Record<string, any> = {},
    page: number = 1
  ): Promise<{ results: T[]; pagination?: any }> {
    const response = await this.withRetry(() =>
      this.client.get(endpoint, {
        params: { ...params, page_no: page, per_page: 100 }
      })
    );
    return response.data;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/v1/geofences', {
        params: { page_no: 1, per_page: 1 }
      });
      return true;
    } catch (error) {
      console.error('Motive API connection test failed:', error);
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
          `[Motive] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
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
