/**
 * MOTIVE API CLIENT
 * HTTP client wrapper for Motive API with retry logic and pagination
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export class MotiveClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL = 'https://api.gomotive.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'X-Time-Zone': 'Eastern Time (US & Canada)',  // Toronto is in Eastern Time
        'X-Metric-Units': 'false'                     // Use Imperial units (miles, gallons)
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
            throw new Error('Motive API authentication failed - invalid API key');
          } else if (status === 429) {
            throw new Error('Motive API rate limit exceeded');
          } else if (status >= 500) {
            throw new Error(`Motive API server error: ${status}`);
          } else {
            throw new Error(`Motive API error: ${data?.error_message || data?.message || 'Unknown error'}`);
          }
        } else if (error.request) {
          // Request made but no response
          throw new Error('Motive API request timeout - no response received');
        } else {
          // Request setup error
          throw new Error(`Motive API request failed: ${error.message}`);
        }
      }
    );
  }

  /**
   * GET request with automatic pagination
   * Fetches all pages and returns combined results
   */
  async get<T = any>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T[]> {
    const allResults: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.client.get(endpoint, {
          params: {
            ...params,
            page,
            per_page: 100 // Max results per page
          }
        });

        const data = response.data;

        // Handle different Motive API response formats
        // Some endpoints return: { results: [...], pagination: {...} }
        // Others return: { vehicle_utilizations: [{vehicle_utilization: {...}}], pagination: {...} }
        // Others return: { driver_idle_rollups: [...], pagination: {...} }
        
        if (data.results && Array.isArray(data.results)) {
          // Standard format: { results: [...] }
          allResults.push(...data.results);
        } else {
          // Find the data array by looking for known keys
          const dataKey = Object.keys(data).find(key => 
            Array.isArray(data[key]) && key !== 'pagination'
          );
          
          if (dataKey && Array.isArray(data[dataKey])) {
            // Extract nested data (e.g., vehicle_utilization.vehicle_utilization)
            const records = data[dataKey];
            for (const record of records) {
              // Check if data is nested one level deeper
              const nestedKey = Object.keys(record).find(k => k !== 'pagination' && typeof record[k] === 'object');
              if (nestedKey && record[nestedKey]) {
                allResults.push(record[nestedKey] as T);
              } else {
                allResults.push(record as T);
              }
            }
          } else {
            // No array found, might be single item or error
            if (Object.keys(data).length > 0 && !data.pagination) {
              return [data as T];
            }
          }
        }

        // Check pagination
        if (data.pagination) {
          const { page: currentPage, per_page, total } = data.pagination;
          const totalPages = Math.ceil(total / per_page);
          hasMore = currentPage < totalPages;
          page++;
        } else {
          // No pagination = single page
          hasMore = false;
        }

        // Rate limiting: wait 500ms between pages
        if (hasMore) {
          await this.sleep(500);
        }
      } catch (error) {
        console.error(`Motive API GET ${endpoint} page ${page} failed:`, error);
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
    params: Record<string, any> = {},
    page: number = 1
  ): Promise<{ results: T[]; pagination?: any }> {
    const response = await this.client.get(endpoint, {
      params: {
        ...params,
        page,
        per_page: 100
      }
    });

    return response.data;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to fetch geofences (lightweight endpoint)
      await this.client.get('/v1/geofences', {
        params: { page: 1, per_page: 1 }
      });
      return true;
    } catch (error) {
      console.error('Motive API connection test failed:', error);
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
