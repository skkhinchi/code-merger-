import axios from 'axios'

/**
 * User-facing message for failed API calls (network, connection refused, etc.).
 */
export function formatApiError(e: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(e)) {
    const code = e.code
    const noResponse = e.response === undefined

    if (
      code === 'ERR_NETWORK' ||
      code === 'ECONNREFUSED' ||
      e.message === 'Network Error' ||
      (noResponse && e.request)
    ) {
      return (
        'Cannot reach the API (connection refused or offline). ' +
        'Start the backend from the project: cd backend && node index.js ' +
        '(default port 5001). In dev, Vite can proxy /api to that port; optional VITE_API_URL goes in frontend/.env.'
      )
    }

    if (e.response?.data && typeof e.response.data === 'object' && e.response.data !== null) {
      const data = e.response.data as { message?: unknown }
      if (typeof data.message === 'string') return data.message
    }
  }

  if (e instanceof Error) return e.message
  return fallback
}
