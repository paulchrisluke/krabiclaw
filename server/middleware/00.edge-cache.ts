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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfReq = (event.context.cloudflare as any)?.request as Request | undefined
  const host = cfReq?.headers.get('host') ?? getHeader(event, 'host') ?? ''
  const hostname = host.split(':')[0] ?? host

  // Preview/staging Workers are redeployed on every CI run. Serving KV-cached HTML
  // from the previous deploy references stale asset hashes (/_nuxt/*.css|js) that
  // no longer exist in the new deploy's Assets binding → ERR_ABORTED in tests.
  // Skip the KV layer entirely; SSR always returns fresh HTML with correct hashes.
  if (isPreviewContext(hostname)) return

  const key = buildHtmlCacheKey(event)
  if (!key) return

  // Access KV directly from the Cloudflare event context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kv = (event.context.cloudflare?.env as any)?.SITE_CACHE as KVNamespace | undefined
  if (!kv) return

  try {
    const hit = await kv.get(key, 'text')
    if (!hit) return

    const cacheControl = `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}, max-age=0`

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
