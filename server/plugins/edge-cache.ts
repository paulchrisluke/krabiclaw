// KV-based SSR HTML cache — populate after each page response.
// Uses Nitro's afterResponse hook with H3 utility functions only
// (no event.node.* — not available in Cloudflare Workers Web API runtime).

import { getHeader, getResponseStatus, getResponseHeader, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { buildHtmlCacheKey } from '~/server/utils/edge-cache'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'
const CACHE_TTL_SECONDS = 60

type CloudflareRequestContext = {
  request?: Request
}

type CloudflareEnvContext = {
  SITE_CACHE?: KVNamespace
}

export default defineNitroPlugin((nitroApp) => {
  // Override cache-control for preview/staging hosts before the response is sent.
  // routeRules sets `public, s-maxage=60` globally, but these hosts serve multiple
  // tenants on the same hostname — CF edge caching would cross-contaminate tenants.
  // This hook fires after the route handler (including routeRules) but before the
  // network send, so the override takes effect even on the SSR path.
  nitroApp.hooks.hook('beforeResponse', (event: H3Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfRequest = (event.context.cloudflare as any)?.request as Request | undefined
    const host = cfRequest?.headers.get('host') ?? getHeader(event, 'host') ?? ''
    const hostname = host.split(':')[0] ?? host
    if (isPreviewContext(hostname)) {
      setResponseHeader(event, 'cache-control', 'private, no-store')
    }
  })

  nitroApp.hooks.hook('afterResponse', async (event: H3Event, response?: { body?: unknown }) => {
    const body = response?.body
    if (!body || typeof body !== 'string') return
    if (event.method !== 'GET') return

    // Use H3 utility — event.node.res is not available in CF Workers
    const status = getResponseStatus(event)
    if (status !== 200) return

    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return

    // Use Cloudflare runtime request headers for cookies and host (more reliable on cloudflare_module)
    const cfRequest = (event.context.cloudflare as CloudflareRequestContext | undefined)?.request

    // Skip KV writes on preview/staging — same reason as the read-path skip in
    // 00.edge-cache.ts: stale HTML survives redeploys and references wrong asset hashes.
    const writeHost = cfRequest?.headers.get('host') ?? getHeader(event, 'host') ?? ''
    const writeHostname = writeHost.split(':')[0] ?? writeHost
    if (isPreviewContext(writeHostname)) return
    const cookieHeader = cfRequest?.headers.get('cookie') ?? getHeader(event, 'cookie') ?? ''
    if (cookieHeader.includes(SESSION_COOKIE)) return

    // Only skip caching when a Set-Cookie carries the real auth session — the
    // anonymous pageview-tracking cookies (kc_visitor_id/kc_session_id) are set on
    // every request (see getOrCreateSessionId's unconditional refresh) and don't
    // personalize the HTML, so they must not block caching or the KV write path
    // never fires for any real tenant page.
    const setCookieHeader = getResponseHeader(event, 'set-cookie')
    const setCookieValues = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [String(setCookieHeader)]
        : []
    if (setCookieValues.some((c) => c.includes(SESSION_COOKIE))) return

    // Check for CSRF tokens or nonce markers in HTML body
    if (/csrf|nonce=|random\/nonce/i.test(body)) return

    const ct = String(getResponseHeader(event, 'content-type') ?? '')
    if (!ct.includes('text/html')) return

    const key = buildHtmlCacheKey(event)
    if (!key) return

    const kv = (event.context.cloudflare?.env as CloudflareEnvContext | undefined)?.SITE_CACHE
    if (!kv) {
      console.warn('[edge-cache] SITE_CACHE KV not available')
      return
    }

    try {
      await kv.put(key, body, { expirationTtl: CACHE_TTL_SECONDS })
    } catch (err) {
      console.error('[edge-cache] KV put failed:', key, String(err))
    }
  })
})
