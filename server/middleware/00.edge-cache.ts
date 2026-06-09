// KV-based SSR HTML cache — globally replicated, ~4ms read latency from any edge.
// Replaces the previous caches.default approach which was per-datacenter only.
//
// Cache key: html:<host>:<pathname>
// Stored in SITE_CACHE KV namespace with CACHE_TTL_SECONDS TTL.
// On a hit: D1 tenant lookup and Vue SSR are skipped entirely.
// On a miss: falls through to SSR; server/plugins/edge-cache.ts populates KV.
//
// NEVER cached:
//   - /api/**, /dashboard/**, /admin/**, /auth/** — auth-gated
//   - Requests with session cookie — personalised
//   - Paths with query strings
//   - Non-GET requests
//   - No Host header

import { defineEventHandler, setResponseHeaders, getHeader } from 'h3'
import { buildHtmlCacheKey } from '~/server/utils/edge-cache'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

const CACHE_TTL_SECONDS = 60

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return
  if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return
  if (event.path.includes('?')) return

  const key = buildHtmlCacheKey(event)
  if (!key) return

  // Access KV directly from the Cloudflare event context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kv = (event.context.cloudflare?.env as any)?.SITE_CACHE as KVNamespace | undefined
  if (!kv) return

  try {
    const hit = await kv.get(key, 'text')
    if (!hit) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfRequest = (event.context.cloudflare as any)?.request as Request | undefined
    const host = cfRequest?.headers.get('host') ?? getHeader(event, 'host') ?? ''
    const hostname = host.split(':')[0] ?? host
    // Preview/staging hosts share one hostname across tenants — must not let CF
    // edge-cache the response or tenants will receive each other's cached HTML.
    const cacheControl = isPreviewContext(hostname)
      ? 'private, no-store'
      : `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}, max-age=0`

    setResponseHeaders(event, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cacheControl,
      'x-edge-cache': 'HIT',
    })
    return hit
  } catch {
    // KV errors are non-fatal — fall through to SSR
  }
})
