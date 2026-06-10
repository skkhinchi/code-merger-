const DEFAULT_DEV_API = 'http://localhost:5001'

/**
 * Base URL for API requests.
 * - If `VITE_API_URL` is set → use it (trim trailing slash).
 * - In dev with no URL → `http://localhost:5001` (backend default port).
 * - In production builds, set `VITE_API_URL` to your API origin.
 */
export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_API
  }
  return ''
}
