
import type { H3Event } from 'nitro'
import type { HTTPEvent } from 'nitro/h3'
import { useRuntimeConfig } from 'nitro/runtime-config'
import { usesTenantHeader } from '~/server/utils/tenant-hosts'

/**
 * Cached HTML references the `/_nuxt/` asset hashes of the build that rendered
 * it. Those files are replaced wholesale by the next deploy, so HTML from the
 * previous build names scripts the Assets binding no longer has — the browser
 * gets a page whose every module 400s and never hydrates.
 *
 * The build id is therefore part of the key, not a property of the value: a new
 * deploy simply misses, and no HTML can outlive the assets it points at. This
 * replaced a skip that disabled the cache entirely on preview and staging,
 * which treated the same defect by not caching where it was noticed.
 */
export function buildHtmlCacheKey(event: H3Event | HTTPEvent): string | null {

  const request = event.req
  const cfRequest = request
  const host = cfRequest?.headers.get('host')
    ?? cfRequest?.headers.get('x-forwarded-host')
    ?? request.headers.get('host')
    ?? request.headers.get('x-forwarded-host')
  if (!host) return null
  const buildId = useRuntimeConfig().app?.buildId
  if (!buildId) return null
  const hostname = host.split(':')[0] ?? host
  // Only hosts that cannot express tenant identity in their hostname carry it in
  // x-preview-tenant, and there it must be part of the key or two tenants share
  // one entry. Asking isNonProductionHost instead put an untrusted header in the
  // key on deployed staging aliases, which resolve their tenant from the
  // hostname and would have fragmented on a header a client chose.
  const previewTenant = usesTenantHeader(hostname)
    ? (cfRequest?.headers.get('x-preview-tenant')
      ?? request.headers.get('x-preview-tenant'))
    : null
  const tenantSuffix = previewTenant ? `:${previewTenant}` : ''
  const path = 'path' in event ? event.path : new URL(request.url).pathname
  return `html:${host}${tenantSuffix}:${buildId}:${path}`
}

/**
 * Purge all KV-cached HTML entries for the given site hostnames.
 * Called after any mutating MCP tool call so the next browser load gets
 * fresh SSR HTML with the correct /_nuxt/ asset hashes.
 *
 * KV keys are structured as: html:<host>[:<preview tenant>]:<build id>:<pathname>
 * We list by prefix html:<host>: and delete all matches, so a purge clears the
 * host's entries for every build id and preview tenant.
 */
export async function purgeSiteKvCache(
  kv: KVNamespace,
  hostnames: string[],
): Promise<void> {
  const deletions: Promise<void>[] = []
  for (const hostname of hostnames) {
    const prefix = `html:${hostname}:`
    let cursor: string | undefined
    do {
      const list: KVNamespaceListResult<unknown, string> = await kv.list({ prefix, cursor, limit: 100 })
      for (const key of list.keys) {
        deletions.push(kv.delete(key.name))
      }
      cursor = list.list_complete ? undefined : list.cursor
    } while (cursor)
  }
  await Promise.all(deletions)
}
