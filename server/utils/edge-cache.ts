import { getHeader } from 'h3'
import type { H3Event } from 'h3'

export function buildHtmlCacheKey(event: H3Event): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfRequest = (event.context.cloudflare as any)?.request as Request | undefined
  const host = cfRequest?.headers.get('host')
    ?? cfRequest?.headers.get('x-forwarded-host')
    ?? getHeader(event, 'host')
    ?? getHeader(event, 'x-forwarded-host')
  if (!host) return null
  return `html:${host}:${event.path}`
}
