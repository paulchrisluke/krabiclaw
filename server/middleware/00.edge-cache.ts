// KV-based SSR HTML cache — globally replicated, ~4ms read latency from any edge.
// Replaces the previous caches.default approach which was per-datacenter only.
//
// Cache key: html:<host>:<pathname>
// Stored in SITE_CACHE KV namespace with a 60s TTL.
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
import { cloudflareEnv } from '~/server/utils/api-response'

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

  const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
  if (!host) return

  const env = cloudflareEnv(event)
  const kv = (env as Record<string, unknown>).SITE_CACHE as KVNamespace | undefined
  if (!kv) return

  const key = `html:${host}:${event.path}`

  try {
    const hit = await kv.get(key, 'text')
    if (!hit) return

    setResponseHeaders(event, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300, max-age=0',
      'x-edge-cache': 'HIT',
    })
    return hit
  } catch {
    // KV errors are non-fatal — fall through to SSR
  }
})
