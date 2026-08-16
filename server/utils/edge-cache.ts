
import type { H3Event } from 'nitro'
import type { HTTPEvent } from 'nitro/h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

export function buildHtmlCacheKey(event: H3Event | HTTPEvent): string | null {

  const request = event.req
  const cfRequest = request
  const host = cfRequest?.headers.get('host')
    ?? cfRequest?.headers.get('x-forwarded-host')
    ?? request.headers.get('host')
    ?? request.headers.get('x-forwarded-host')
  if (!host) return null
  const hostname = host.split(':')[0] ?? host
  // On hosts where multiple tenants share one hostname (workers.dev, preview.*, staging.*),
  // include x-preview-tenant in the key so their cached HTML doesn't collide.
  const previewTenant = isPreviewContext(hostname)
    ? (cfRequest?.headers.get('x-preview-tenant')
      ?? request.headers.get('x-preview-tenant'))
    : null
  const tenantSuffix = previewTenant ? `:${previewTenant}` : ''
  const path = 'path' in event ? event.path : new URL(request.url).pathname
  return `html:${host}${tenantSuffix}:${path}`
}

/**
 * Purge all KV-cached HTML entries for the given site hostnames.
 * Called after any mutating MCP tool call so the next browser load gets
 * fresh SSR HTML with the correct /_nuxt/ asset hashes.
 *
 * KV keys are structured as: html:<host>:<pathname>
 * We list by prefix html:<host>: and delete all matches.
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
