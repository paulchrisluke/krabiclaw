// KV-based SSR HTML cache — populate after each page response.
// Uses Nitro's afterResponse hook with H3 utility functions only
// (no event.node.* — not available in Cloudflare Workers Web API runtime).

import { getHeader, getResponseStatus, getResponseHeader } from 'h3'
import type { H3Event } from 'h3'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'
const CACHE_TTL_SECONDS = 60

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nitroApp.hooks.hook('afterResponse', async (event: H3Event, response?: { body?: unknown }) => {
    const body = response?.body
    if (!body || typeof body !== 'string') return
    if (event.method !== 'GET') return

    // Use H3 utility — event.node.res is not available in CF Workers
    const status = getResponseStatus(event)
    if (status !== 200) return

    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return
    if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

    const ct = String(getResponseHeader(event, 'content-type') ?? '')
    if (!ct.includes('text/html')) return

    const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
    if (!host) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (event.context.cloudflare?.env as any)?.SITE_CACHE as KVNamespace | undefined
    if (!kv) {
      console.warn('[edge-cache] SITE_CACHE KV not available')
      return
    }

    const key = `html:${host}:${event.path}`

    try {
      await kv.put(key, body, { expirationTtl: CACHE_TTL_SECONDS })
    } catch (err) {
      console.error('[edge-cache] KV put failed:', key, String(err))
    }
  })
})
