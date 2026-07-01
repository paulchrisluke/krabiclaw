// Purges the bootstrap KV cache (server/utils/bootstrap-cache.ts) after any
// successful write from a dashboard editor route.
//
// This is a separate hook from edge-cache.ts's HTML-cache purge on purpose:
// that one is only wired to the two MCP route files (server/api/mcp.post.ts,
// server/api/mcp/platform.post.ts), not the ~67 dashboard editor routes under
// server/api/editor/sites/[siteId]/**. Reusing it as-is would leave the
// bootstrap cache stale after every dashboard-originated edit — a regression
// for dashboard editors, who see edits reflected immediately today because
// there's no cache in front of bootstrap at all yet.
//
// Covering all dashboard routes from one afterResponse hook (instead of a
// call added to every mutating route file) relies on event.context.params
// being populated by Nitro's router before dispatch — the same object this
// hook receives, and the same field every one of those route files already
// reads via getRouterParam(event, 'siteId').
//
// MCP tool mutations are NOT covered here — server/api/mcp.post.ts calls
// purgeBootstrapCache() directly, reusing the siteId it already resolves for
// its existing HTML-cache purge. server/api/mcp/platform.post.ts needs no
// call: its tools only touch site_id IS NULL platform-scoped rows, which the
// bootstrap endpoint's tenant-scoped queries (WHERE site_id = ?) never read.

import { getResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { purgeBootstrapCache } from '~/server/utils/bootstrap-cache'

const EDITOR_SITES_PREFIX = '/api/editor/sites/'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', async (event: H3Event) => {
    if (event.method === 'GET' || event.method === 'HEAD') return
    if (!event.path.startsWith(EDITOR_SITES_PREFIX)) return

    const status = getResponseStatus(event)
    if (status < 200 || status >= 300) return

    const siteId = event.context.params?.siteId
    if (!siteId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (event.context.cloudflare?.env as any)?.SITE_CACHE as KVNamespace | undefined
    if (!kv) return

    // Awaited inline rather than scheduled via waitUntil — afterResponse hooks
    // run after the client has already received the response, but leaving this
    // detached let the request be considered "done" by CI/tests before KV was
    // actually cleared. Awaiting here doesn't block the client (response is
    // already sent); it only blocks Nitro from marking the request lifecycle
    // complete until the purge finishes.
    try {
      await purgeBootstrapCache(kv, siteId)
    } catch (err: unknown) {
      console.warn('[bootstrap-cache-invalidate] purge failed:', String(err))
    }
  })
})
