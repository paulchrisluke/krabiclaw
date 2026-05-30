// Cloudflare Cache API — populate the cache after each SSR render.
// Fires via Nuxt's render:response hook, which only runs for Vue SSR pages
// (never for API routes, static assets, or redirects).
//
// The middleware at server/middleware/00.edge-cache.ts serves subsequent requests
// from cache, skipping SSR + D1 tenant lookup entirely.
//
// TTL strategy: 60 s fresh, 300 s stale-while-revalidate.
// Content updates propagate within 60 s without any explicit purge.
// To purge immediately after publishAllDrafts, call caches.default.delete()
// with the same key pattern (future work — TTL is acceptable for now).

import { getHeader } from 'h3'
import type { H3Event } from 'h3'

const SESSION_COOKIE = 'better-auth.session_token'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const CACHE_TTL = 60      // fresh for 60 s
const CACHE_SWR = 300     // serve stale for up to 5 min while revalidating

interface RenderResponse {
  body: string
  statusCode: number
  headers: Record<string, string | string[]>
}

function cacheKey(host: string, pathname: string): string {
  return `https://ssr.cache/${host}${pathname}`
}

export default defineNitroPlugin((nitroApp) => {
  // Cast through unknown: browser's CacheStorage type lacks .default (CF-specific).
  const cfCaches = typeof caches !== 'undefined'
    ? (caches as unknown as { default: Cache })
    : null
  if (!cfCaches?.default) return

  // render:response fires after Vue SSR completes and gives us the rendered HTML
  // as a string — safe to cache without consuming a ReadableStream.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nitroApp.hooks.hook('render:response' as any, async (
    response: RenderResponse,
    { event }: { event: H3Event },
  ) => {
    if (response.statusCode !== 200) return
    if (event.method !== 'GET') return
    if (event.path === '/' || event.path === '') return
    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return

    // Don't cache if the response sets a cookie (auth/session response)
    const sc = response.headers['set-cookie'] ?? response.headers['Set-Cookie']
    if (sc && (Array.isArray(sc) ? sc.length > 0 : sc)) return

    // Don't cache if the request carries a session cookie (personalised response)
    if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

    // No Host header → can't build a safe per-tenant cache key; skip caching
    const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
    if (!host) return

    const key = cacheKey(host, event.path)

    try {
      const contentType = (response.headers['content-type'] as string | undefined)
        ?? 'text/html; charset=utf-8'

      const headers = new Headers({
        'content-type': contentType,
        'cache-control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=${CACHE_SWR}`,
        'x-edge-cache': 'MISS',
      })

      await cfCaches.default.put(
        new Request(key),
        new Response(response.body, { status: 200, headers }),
      )
    } catch {
      // Non-fatal — the response was already sent to the client
    }
  })
})
