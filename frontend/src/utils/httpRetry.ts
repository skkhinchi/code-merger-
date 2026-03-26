import axios from 'axios'

export function shouldRetryRequest(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false
  const code = e.code
  if (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || code === 'ETIMEDOUT') return true
  const s = e.response?.status
  if (s === undefined) return true
  return s === 429 || s === 502 || s === 503 || s === 504
}

/**
 * Retries a few times with exponential backoff on transient failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 500
  let last: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (!shouldRetryRequest(e) || attempt === maxRetries - 1) {
        throw e
      }
      const delay = baseDelayMs * 2 ** attempt
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw last
}
