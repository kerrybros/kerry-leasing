const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

    const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'Unknown error',
      message: response.statusText,
    }));
    throw new ApiError(response.status, error.message || error.error);
  }

  return response.json();
}

// Convenience methods that accept a token parameter and optional headers
export const createApiClient = (token: string | null, customHeaders: Record<string, string> = {}) => ({
  get: <T>(endpoint: string) =>
    apiRequest<T>(endpoint, token, { 
      method: 'GET',
      headers: customHeaders,
      cache: 'no-store',
    }),

  post: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, token, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers: customHeaders,
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, token, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      headers: customHeaders,
    }),

  patch: <T>(endpoint: string, data?: unknown) =>
    apiRequest<T>(endpoint, token, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      headers: customHeaders,
    }),

  delete: <T>(endpoint: string) =>
    apiRequest<T>(endpoint, token, { 
      method: 'DELETE',
      headers: customHeaders,
    }),
});
