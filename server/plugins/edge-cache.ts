// KV-based SSR HTML cache — populate after each page response.
// Uses Nitro's afterResponse hook (always fires, body is reliably a string).
//
// Stores rendered HTML in SITE_CACHE KV with a 60s TTL.
// KV is globally replicated: any Cloudflare datacenter gets a ~4ms KV hit
// instead of running SSR on cache miss.

import { getHeader, getResponseHeader } from 'h3'
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
    // Only cache successful GET HTML responses
    if (event.method !== 'GET') return
    if (event.node.res.statusCode !== 200) return
    if (typeof body !== 'string' || !body) return
    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return
    if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

    // Only cache HTML responses
    const ct = String(getResponseHeader(event, 'content-type') ?? '')
    if (!ct.includes('text/html')) return

    // Don't cache if response set an auth cookie
    const sc = event.node.res.getHeader('set-cookie')
    const scArr = Array.isArray(sc) ? sc : (sc != null ? [String(sc)] : [])
    if (scArr.some(c => c.includes(SESSION_COOKIE))) return

    const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
    if (!host) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (event.context.cloudflare?.env as any)?.SITE_CACHE as KVNamespace | undefined
    if (!kv) return

    const key = `html:${host}:${event.path}`

    try {
      await kv.put(key, body, { expirationTtl: CACHE_TTL_SECONDS })
    } catch (err) {
      console.error('[edge-cache] KV put failed:', key, err)
    }
  })
})
