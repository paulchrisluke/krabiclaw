// KV-based SSR HTML cache — populate after each page response.


import type { HTTPEvent } from 'nitro/h3'
import { buildHtmlCacheKey } from '~/server/utils/edge-cache'
import { isPreviewContext } from '~/server/utils/tenant-hosts'
import { definePlugin } from 'nitro';

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/links', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'
const CACHE_TTL_SECONDS = 60

type CloudflareRequestContext = {
  request?: Request
}

type CloudflareEnvContext = {
  SITE_CACHE?: KVNamespace
}

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', async (response, event: HTTPEvent) => {
    const request = event.req
    const path = new URL(request.url).pathname
    if (response.status !== 200) return
    if (request.method !== 'GET') return

    if (request.url.includes('?')) return
    if (SKIP_PREFIXES.some(p => path.startsWith(p))) return

    // Use Cloudflare runtime request headers for cookies and host (more reliable on cloudflare_module)
    const cfRequest = (request.runtime?.cloudflare as CloudflareRequestContext | undefined)?.request

    // Skip KV writes on preview/staging — same reason as the read-path skip in
    // 00.edge-cache.ts: stale HTML survives redeploys and references wrong asset hashes.
    const writeHost = cfRequest?.headers.get('host') ?? request.headers.get('host') ?? ''
    const writeHostname = writeHost.split(':')[0] ?? writeHost
    if (isPreviewContext(writeHostname)) return
    const cookieHeader = cfRequest?.headers.get('cookie') ?? request.headers.get('cookie') ?? ''
    if (cookieHeader.includes(SESSION_COOKIE)) return

    // Only skip caching when a Set-Cookie carries the real auth session — the
    // anonymous pageview-tracking cookies (kc_visitor_id/kc_session_id) are set on
    // every request (see getOrCreateSessionId's unconditional refresh) and don't
    // personalize the HTML, so they must not block caching or the KV write path
    // never fires for any real tenant page.
    const setCookieValues = response.headers.get('set-cookie')?.split(/,\s*(?=[^;]+=)/) ?? []
    if (setCookieValues.some((c) => c.includes(SESSION_COOKIE))) return

    const ct = response.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return

    const body = await response.clone().text()
    // Check for CSRF tokens or nonce markers in HTML body
    if (/csrf|nonce=|random\/nonce/i.test(body)) return

    const key = buildHtmlCacheKey(event)
    if (!key) return

    const kv = (request.runtime?.cloudflare?.env as CloudflareEnvContext | undefined)?.SITE_CACHE
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
