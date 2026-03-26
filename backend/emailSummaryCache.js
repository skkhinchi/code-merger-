/**
 * In-memory TTL cache for email-summary responses (same calendar day key).
 * For Redis in production, replace get/set with Redis calls behind the same interface.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

/** @type {Map<string, { value: unknown, expires: number }>} */
const store = new Map();

/**
 * Stable key for the calendar day of `d` in the server's local timezone
 * (matches Gmail day filtering in gmailService).
 * @param {Date} d
 */
export function dateToCacheKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * @param {string} key
 * @returns {unknown | null}
 */
export function getEmailSummaryCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {number} [ttlMs]
 */
export function setEmailSummaryCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    store.delete(first);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}
