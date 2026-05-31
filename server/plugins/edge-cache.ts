// KV-based SSR HTML cache — populate after each SSR render.
// Fires via Nuxt's render:response hook (Vue SSR pages only).
//
// Stores rendered HTML in SITE_CACHE KV with a 60s TTL.
// KV is globally replicated: the next request from any Cloudflare datacenter
// will get a KV hit (~4ms) instead of running SSR (~300-800ms).
//
// The middleware at server/middleware/00.edge-cache.ts serves KV hits.

import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'

const SKIP_PREFIXES = [
  '/api/', '/dashboard', '/admin', '/auth/',
  '/signup', '/login', '/_nuxt/', '/assets/', '/_ipx/',
]

const SESSION_COOKIE = 'better-auth.session_token'
const CACHE_TTL_SECONDS = 60

interface RenderResponse {
  body: string
  statusCode: number
  headers: Record<string, string | string[]>
}

export default defineNitroPlugin((nitroApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nitroApp.hooks.hook('render:response' as any, async (
    response: RenderResponse,
    { event }: { event: H3Event },
  ) => {
    if (response.statusCode !== 200) return
    if (event.method !== 'GET') return
    if (event.path.includes('?')) return
    if (SKIP_PREFIXES.some(p => event.path.startsWith(p))) return
    if ((getHeader(event, 'cookie') ?? '').includes(SESSION_COOKIE)) return

    const sc = response.headers['set-cookie'] ?? response.headers['Set-Cookie']
    const scArr = Array.isArray(sc) ? sc : (sc ? [String(sc)] : [])
    if (scArr.some(c => c.includes(SESSION_COOKIE))) return

    const host = getHeader(event, 'host') || getHeader(event, 'x-forwarded-host')
    if (!host) return

    const env = cloudflareEnv(event)
    const kv = (env as Record<string, unknown>).SITE_CACHE as KVNamespace | undefined
    if (!kv) return

    const key = `html:${host}:${event.path}`

    try {
      await kv.put(key, response.body, { expirationTtl: CACHE_TTL_SECONDS })
    } catch {
      // Non-fatal — response already sent to the client
    }
  })
})
