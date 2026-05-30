// Cloudflare Cache API — serve SSR HTML cache hits before any middleware runs.
// On a hit: the D1 tenant lookup, Vue SSR render, and all downstream middleware are skipped.
// On a miss: falls through to the normal Nitro pipeline, which populates the cache via
// the edge-cache Nitro plugin (server/plugins/edge-cache.ts).
//
// Cache key: https://ssr.cache/<host><pathname>
// This synthetic URL is never fetched — it is purely a cache namespace key.
// Including the host prevents cross-tenant cache contamination.
//
// NEVER cached here:
//   - Root "/" — i18n browser-language detection redirects vary by Accept-Language
//   - /api/**, /dashboard/**, /admin/**, /auth/** — auth-gated or API responses
//   - Requests with a session cookie — content may be personalised
//   - Paths with query strings — we don't vary the cache key on QS params
//   - Non-GET requests

import { defineEventHandler, sendWebResponse, getHeader } from 'h3'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'

function cacheKey(host: string, pathname: string): string {
  return `https://ssr.cache/${host}${pathname}`
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return

  // i18n: root "/" varies by Accept-Language → never serve from cache
  if (event.path === '/' || event.path === '') return

  // Auth/API routes
  if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return

  // Authenticated session — response may be personalised
  if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

  // Query strings: we don't vary on them so skip caching when present
  if (event.path.includes('?')) return

  // Cloudflare Cache API is only available in the CF Workers runtime.
  // Cast through unknown: browser's CacheStorage type lacks .default (CF-specific).
  const cfCaches = typeof caches !== 'undefined'
    ? (caches as unknown as { default: Cache })
    : null
  if (!cfCaches?.default) return

  // No Host header → can't build a safe per-tenant cache key; skip caching
  const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
  if (!host) return

  try {
    const hit = await cfCaches.default.match(new Request(cacheKey(host, event.path)))
    if (!hit) return

    return sendWebResponse(
      event,
      new Response(hit.body, {
        status: hit.status,
        headers: new Headers({
          ...Object.fromEntries(hit.headers.entries()),
          'x-edge-cache': 'HIT',
        }),
      }),
    )
  } catch {
    // Cache errors are non-fatal — fall through to SSR
  }
})
