// Reads the GA4 client and session IDs out of the cookies Zaraz's GA4 tool sets.
// The client_id is the last two segments of `GA1.1.<random>.<timestamp>`.
// Shared by the browser (checkout attribution) and the server (Measurement
// Protocol delivery of outcomes the visitor's own request produced).
function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseGaClientId(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)_ga=([^;]+)/)
  if (!match) return null
  const parts = decodeCookieValue(match[1] ?? '').split('.')
  if (parts.length < 4) return null
  return `${parts[2]}.${parts[3]}`
}

export function parseGaSessionId(cookieHeader: string): number | null {
  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=')
    if (!rawName?.startsWith('_ga_')) continue
    const value = decodeCookieValue(rawValue.join('='))
    const firstSessionSegment = value.match(/^GS\d+\.\d+\.(\d+)/)?.[1]
      ?? value.match(/(?:^|[$.])s(\d+)(?:[$.]|$)/)?.[1]
      ?? value.split('.').find((part, index) => index >= 2 && /^\d+$/.test(part))
    const sessionId = Number(firstSessionSegment)
    if (Number.isSafeInteger(sessionId) && sessionId > 0) return sessionId
  }
  return null
}

