/**
 * SAMSARA API CLIENT
 * HTTP client wrapper for Samsara API with retry logic and pagination
 */

import axios, { AxiosInstance } from 'axios';

export class SamsaraClient {
  private client: AxiosInstance;
  private apiToken: string;
  private baseURL = 'https://api.samsara.com';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response) {
          // API responded with error status
          const status = error.response.status;
          const data = error.response.data;
          
          if (status === 401) {
            const path =
              typeof error.config?.url === 'string'
                ? error.config.url
                : `${error.config?.baseURL ?? ''}${(error.config as any)?.url ?? ''}`;
            throw new Error(
              `Samsara API authentication failed - invalid API token (HTTP 401 on ${path || 'unknown path'}). ` +
                `If other fleet endpoints work, the token may lack permission for this path (e.g. safety events).`
            );
          } else if (status === 429) {
            throw new Error('Samsara API rate limit exceeded');
          } else if (status >= 500) {
            throw new Error(`Samsara API server error: ${status}`);
          } else {
            throw new Error(`Samsara API error: ${data?.message || 'Unknown error'}`);
          }
        } else if (error.request) {
          // Request made but no response
          throw new Error('Samsara API request timeout - no response received');
        } else {
          // Request setup error
          throw new Error(`Samsara API request failed: ${error.message}`);
        }
      }
    );
  }

  /**
   * GET request with automatic cursor-based pagination
   * Fetches all pages and returns combined results
   */
  async get<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T[]> {
    const allResults: T[] = [];
    let hasMore = true;
    let after: string | undefined = undefined;

    while (hasMore) {
      try {
        const requestParams: Record<string, any> = {
          ...params,
          limit: params.limit ?? 512 // Some endpoints (e.g. idling/events) max 200
        };

        if (after) {
          requestParams.after = after;
        }

        const response = await this.client.get(endpoint, {
          params: requestParams
        });

        const data = response.data;

        // Samsara uses: { data: [...], pagination: { hasNextPage, endCursor } }
        if (data.data && Array.isArray(data.data)) {
          allResults.push(...data.data);
        }

        // Check pagination
        if (data.pagination) {
          hasMore = data.pagination.hasNextPage === true;
          after = data.pagination.endCursor;
        } else {
          hasMore = false;
        }

        // Rate limiting: wait 500ms between pages
        if (hasMore) {
          await this.sleep(500);
        }
      } catch (error) {
        console.error(`Samsara API GET ${endpoint} failed:`, error);
        throw error;
      }
    }

    return allResults;
  }

  /**
   * GET single page (for testing or manual pagination)
   */
  async getSinglePage<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<{ data: T[]; pagination?: any }> {
    const response = await this.client.get(endpoint, {
      params: {
        ...params,
        limit: 512
      }
    });

    return response.data;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to fetch vehicles (lightweight endpoint)
      await this.client.get('/fleet/vehicles', {
        params: { limit: 1 }
      });
      return true;
    } catch (error) {
      console.error('Samsara API connection test failed:', error);
      return false;
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
