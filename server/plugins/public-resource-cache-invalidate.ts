// Purges public resource KV entries after any
// successful write from a dashboard editor route.
//
// This is a separate hook from edge-cache.ts's HTML-cache purge on purpose:
// that one is only wired to the two MCP route files (server/api/mcp.post.ts,
// server/api/mcp/platform.post.ts), not the ~67 dashboard editor routes under
// server/api/editor/sites/[siteId]/**. Reusing it as-is would leave the
// public resource cache stale after every dashboard-originated edit — a regression
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
// purgePublicResourceCache() directly, reusing the siteId it already resolves for
// its existing HTML-cache purge. server/api/mcp/platform.post.ts needs no
// call: its tools only touch site_id IS NULL platform-scoped rows, which the
// public resource endpoints's tenant-scoped queries (WHERE site_id = ?) never read.

import { getHeader, getResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { queryAll } from '~/server/db'
import { normalizeHost } from '~/server/utils/tenant-hosts'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { purgePublicResourceCache } from '~/server/utils/public-resource-cache'

const EDITOR_SITES_PREFIX = '/api/editor/sites/'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', async (event: H3Event) => {
    if (event.method === 'GET' || event.method === 'HEAD') return
    if (!event.path.startsWith(EDITOR_SITES_PREFIX)) return

    const status = getResponseStatus(event)
    if (status < 200 || status >= 300) return

    const siteId = event.context.params?.siteId
    if (!siteId) return

    const runtimeEnv = event.context.cloudflare?.env as {
      DB?: Parameters<typeof queryAll>[0]
      SITE_CACHE?: KVNamespace
      NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
    } | undefined
    const kv = runtimeEnv?.SITE_CACHE
    if (!kv) return

    // Awaited inline rather than scheduled via waitUntil — afterResponse hooks
    // run after the client has already received the response, but leaving this
    // detached let the request be considered "done" by CI/tests before KV was
    // actually cleared. Awaiting here doesn't block the client (response is
    // already sent); it only blocks Nitro from marking the request lifecycle
    // complete until the purge finishes.
    try {
      await purgePublicResourceCache(kv, siteId)
      if (runtimeEnv.DB) {
        const domains = await queryAll<{ domain: string }>(runtimeEnv.DB, `
          SELECT domain FROM site_domains
           WHERE site_id = ? AND status = 'active'
        `, [siteId])
        const siteRows = await queryAll<{ subdomain: string | null; custom_domain: string | null }>(runtimeEnv.DB, `
          SELECT subdomain, custom_domain FROM sites WHERE id = ? LIMIT 1
        `, [siteId])
        const site = siteRows[0]
        const freeSiteDomain = normalizeHost(runtimeEnv.NUXT_PUBLIC_FREE_SITE_DOMAIN) || 'krabiclaw.com'
        const hostnames = new Set<string>(domains.map(({ domain }) => domain))
        if (site?.subdomain) hostnames.add(`${site.subdomain}.${freeSiteDomain}`)
        if (site?.custom_domain) hostnames.add(site.custom_domain)

        const requestHost = getHeader(event, 'host') || ''
        const port = requestHost.split(':')[1]
        if (port) {
          for (const hostname of [...hostnames]) {
            if (hostname.endsWith('.localhost')) hostnames.add(`${hostname}:${port}`)
          }
        }
        await purgeSiteKvCache(kv, [...hostnames])
      }
    } catch (err: unknown) {
      console.warn('[public-resource-cache] purge failed:', String(err))
    }
  })
})
