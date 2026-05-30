// Cloudflare Cache API — populate cache after each SSR render.
// Fires via Nuxt's render:response hook (Vue SSR pages only — never API routes).
//
// The middleware at server/middleware/00.edge-cache.ts serves subsequent requests
// from cache, skipping SSR + D1 tenant lookup entirely (~0ms TTFB on cache hit).
//
// TTL: 60s fresh, 300s stale-while-revalidate. Content updates propagate ≤60s.

import { getHeader } from 'h3'
import type { H3Event } from 'h3'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'
const CACHE_TTL = 60
const CACHE_SWR = 300

interface RenderResponse {
  body: string
  statusCode: number
  headers: Record<string, string | string[]>
}

export default defineNitroPlugin((nitroApp) => {
  // Cast through unknown: browser's CacheStorage type lacks .default (CF-specific)
  const cfCaches = typeof caches !== 'undefined'
    ? (caches as unknown as { default: Cache })
    : null
  if (!cfCaches?.default) return

  // render:response fires after Vue SSR completes — body is a string, safe to cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nitroApp.hooks.hook('render:response' as any, async (
    response: RenderResponse,
    { event }: { event: H3Event },
  ) => {
    if (response.statusCode !== 200) return
    if (event.method !== 'GET') return
    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return

    // Don't cache if the response sets an auth/session cookie.
    // Locale preference cookies (i18n_redirected) are the same value for all visitors
    // and must not prevent caching.
    const sc = response.headers['set-cookie'] ?? response.headers['Set-Cookie']
    const scArr = Array.isArray(sc) ? sc : (sc ? [String(sc)] : [])
    if (scArr.some(c => c.includes(SESSION_COOKIE))) return

    // Don't cache if the request carries a session cookie (personalised response)
    if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

    // No Host header → can't build a safe per-tenant cache key
    const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
    if (!host) return

    // Cache key must be on the zone (krabiclaw.com) — CF rejects off-zone URLs
    const cacheKey = `https://${host}${event.path}`

    try {
      const contentType = (response.headers['content-type'] as string | undefined)
        ?? 'text/html; charset=utf-8'

      const headers = new Headers({
        'content-type': contentType,
        'cache-control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_SWR}`,
        'x-edge-cache': 'MISS',
      })

      await cfCaches.default.put(
        new Request(cacheKey),
        new Response(response.body, { status: 200, headers }),
      )
    } catch {
      // Non-fatal — response already sent to the client
    }
  })
})
