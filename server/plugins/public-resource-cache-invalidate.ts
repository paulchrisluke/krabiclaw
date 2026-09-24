// Drains the site-change queue after any successful write from a dashboard
// editor route: the site's public caches are cleared and its slice of the
// search index is brought up to date.
//
// This is a separate hook from edge-cache.ts's HTML-cache purge on purpose:
// that one is only wired to the MCP route (server/api/mcp.post.ts), not the
// ~67 dashboard editor routes under
// server/api/editor/organizations/[organizationId]/**. Reusing it as-is would leave the
// public resource cache stale after every dashboard-originated edit — a regression
// for dashboard editors, who see edits reflected immediately today because
// there's no cache in front of bootstrap at all yet.
//
// Covering all dashboard routes from one response hook (instead of a
// call added to every mutating route file) relies on event.context.params
// being populated by Nitro's router before dispatch — the same object this
// hook receives, and the same field every one of those route files already
// reads via getRouterParam(event, 'organizationId').
//
// MCP tool mutations are NOT covered here — server/api/mcp.post.ts already
// records a durable invalidation for the public resource cache alongside its
// existing HTML-cache purge.

import type { HTTPEvent } from 'nitro/h3'
import type { DbClient } from '~/server/db'
import { drainPublicResourceCacheInvalidations, purgeOrganizationCaches, type OrganizationChangeDrainEnv } from '~/server/utils/public-resource-cache'
import { definePlugin } from 'nitro';

const EDITOR_ORGANIZATIONS_PREFIX = '/api/editor/organizations/'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', async (response, event: HTTPEvent) => {
    const request = event.req
    const path = new URL(request.url).pathname
    if (request.method === 'GET' || request.method === 'HEAD') return
    if (!path.startsWith(EDITOR_ORGANIZATIONS_PREFIX)) return

    const status = response.status
    if (status < 200 || status >= 300) return

    const params = request.context?.params
    const organizationId = params && typeof params === 'object' && 'organizationId' in params && typeof params.organizationId === 'string' ? params.organizationId : undefined
    if (!organizationId) return

    const runtimeEnv = request.runtime?.cloudflare?.env as ({
      DB?: DbClient
      ORGANIZATION_CACHE?: KVNamespace
    } & OrganizationChangeDrainEnv) | undefined
    const kv = runtimeEnv?.ORGANIZATION_CACHE
    if (!kv || !runtimeEnv?.DB) return

    // The site's own caches are cleared before this request is done with, so a
    // read that follows the write cannot see what it replaced — CI reads public
    // resources right after an edit. The queue drain, which also brings the
    // site's search index up to date, outlives the response: a write's own
    // response is not made to wait on a list of index items.
    await purgeOrganizationCaches(runtimeEnv.DB, kv, organizationId, runtimeEnv.NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN)
    const drained = drainPublicResourceCacheInvalidations(runtimeEnv.DB, kv, runtimeEnv, { limit: 100 })
      .catch((err: unknown) => console.warn('[public-resource-cache] site change drain failed:', String(err)))
    const waitUntil = request.runtime?.cloudflare?.context?.waitUntil
    if (waitUntil) waitUntil.call(request.runtime?.cloudflare?.context, drained)
    else await drained
  })
})
