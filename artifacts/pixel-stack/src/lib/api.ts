const PRODUCTION_API_ORIGIN = 'https://pixelstack-app.com';
const REQUEST_TIMEOUT_MS = 8_000;

// Development stays on the preview proxy; packaged Android builds use HTTPS.
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim()
  || (import.meta.env.DEV && typeof window !== 'undefined'
    && /^https?:$/.test(window.location.protocol)
    ? window.location.origin
    : PRODUCTION_API_ORIGIN)
).replace(/\/+$/, '');

export async function apiJson<T>(
  path: string,
  options: Omit<RequestInit, 'signal'> = {},
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No network connection');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'omit',
      ...options,
      headers,
      signal: controller.signal,
    });
    // Keep the timeout active while reading the body, not just the headers.
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`API returned non-JSON content (HTTP ${response.status})`);
    }
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `API request failed (HTTP ${response.status})`);
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('API request timed out (8 seconds)');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
