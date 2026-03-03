/**
 * API Client Module
 * Handles API key management and authenticated requests to the backend.
 */

const API_KEY_STORAGE_KEY = 'openclaw_api_key';

/**
 * Get the stored API key from localStorage
 */
export function getApiKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/**
 * Save API key to localStorage
 */
export function setApiKey(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

/**
 * Remove API key from localStorage
 */
export function clearApiKey(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * Extract agent ID from API key format: {agentId}_{uuid}
 * @param apiKey - The API key to parse
 * @returns The agent ID if valid format, null otherwise
 */
export function getAgentId(apiKey?: string): string | null {
  const key = apiKey ?? getApiKey();
  if (!key || typeof key !== 'string') {
    return null;
  }

  // Find the first underscore which separates agentId from UUID
  const underscoreIndex = key.indexOf('_');

  if (underscoreIndex === -1 || underscoreIndex === 0) {
    return null;
  }

  const agentId = key.substring(0, underscoreIndex);
  const uuidPart = key.substring(underscoreIndex + 1);

  // Validate UUID format (8-4-4-4-12 hex characters)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(uuidPart)) {
    return null;
  }

  return agentId;
}

/**
 * API error class for handling API errors with status codes
 */
export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Authenticated fetch wrapper
 * Automatically adds X-API-Key header if available and handles common error cases
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Copy existing headers if provided
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.keys(existingHeaders).forEach((key) => {
      headers[key] = existingHeaders[key];
    });
  }

  // Add API key header if available
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - clear stored API key
  if (response.status === 401) {
    clearApiKey();
    const errorData = await response.json().catch(() => ({ error: 'Unauthorized' }));
    throw new ApiError(errorData.error || 'Invalid API key', 401);
  }

  // Handle other error responses
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(errorData.error || `HTTP ${response.status}`, response.status);
  }

  // Parse and return JSON response
  return response.json();
}

/**
 * Convenience methods for common HTTP operations
 */
export const api = {
  get: <T>(endpoint: string) => 
    apiFetch<T>(endpoint, { method: 'GET' }),
    
  post: <T>(endpoint: string, data: unknown) => 
    apiFetch<T>(endpoint, { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    
  patch: <T>(endpoint: string, data: unknown) => 
    apiFetch<T>(endpoint, { 
      method: 'PATCH', 
      body: JSON.stringify(data) 
    }),
    
  delete: <T>(endpoint: string) => 
    apiFetch<T>(endpoint, { method: 'DELETE' }),
};
