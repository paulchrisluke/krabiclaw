// KV read-through cache for the public bootstrap endpoint's D1 batch query.
// Mirrors edge-cache.ts's HTML cache shape, but keyed by siteId + bootstrap
// params instead of host + pathname — bootstrap is looked up by siteId
// directly, not by tenant hostname, so no hostname resolution is needed here.
//
// Cache key: bs~<siteId>~<page>~<location>~<experience>~<menu>~<data>~<blogSlug>~<locale>,
// each field percent-encoded (mirrors composables/useBootstrapParams.ts's
// useBootstrapKey(), minus `token` — cached entries are never preview/draft-authorized,
// see the isPreviewAuthorized guard at the call site in bootstrap.get.ts).
// Raised from 60s to 300s once every bootstrap-relevant write path was confirmed to call
// purgeBootstrapCache/purgeBootstrapCacheSafe (dashboard editor routes + MCP were already
// covered; location CRUD, onboarding setup/commit, and Google Business/Places sync were a
// gap closed alongside this change — see those call sites for purgeBootstrapCacheSafe).
export const BOOTSTRAP_CACHE_TTL_SECONDS = 300

export interface BootstrapCacheParams {
  page: string | null
  location: string | null
  experience: string | null
  menu: boolean
  data: string | null
  blogSlug: string | null
  locale: string | undefined
}

// encodeURIComponent doesn't escape "~", so we replace it explicitly to avoid
// delimiter collisions (mirrors composables/useBootstrapParams.ts).
const encodeKeyField = (value: string | null | undefined): string =>
  encodeURIComponent(value ?? '').replace(/~/g, '%7E')

export function buildBootstrapCacheKey(siteId: string, params: BootstrapCacheParams): string {
  return [
    'bs',
    encodeKeyField(siteId),
    encodeKeyField(params.page),
    encodeKeyField(params.location),
    encodeKeyField(params.experience),
    params.menu ? 'm' : '',
    encodeKeyField(params.data),
    encodeKeyField(params.blogSlug),
    encodeKeyField(params.locale),
  ].join('~')
}

export async function getBootstrapCache(kv: KVNamespace, key: string): Promise<string | null> {
  try {
    return await kv.get(key, 'text')
  } catch {
    return null
  }
}

export async function putBootstrapCache(
  kv: KVNamespace,
  key: string,
  body: string,
  ttlSeconds: number = BOOTSTRAP_CACHE_TTL_SECONDS,
): Promise<void> {
  await kv.put(key, body, { expirationTtl: ttlSeconds })
}

/**
 * Purge all cached bootstrap entries for a site.
 * Called after any write to bootstrap-relevant tables (site_content, menus,
 * business_locations, experiences, blog_posts, location_qa, media_assets,
 * site_config, site_locales) so the next read reflects the edit immediately
 * instead of waiting out the TTL.
 *
 * KV keys are structured as: bs~<siteId>~...
 * We list by prefix bs~<siteId>~ and delete all matches.
 */
export async function purgeBootstrapCache(kv: KVNamespace, siteId: string): Promise<void> {
  const prefix = `bs~${encodeKeyField(siteId)}~`
  const deletions: Promise<void>[] = []
  let cursor: string | undefined
  do {
    const list: KVNamespaceListResult<unknown, string> = await kv.list({ prefix, cursor, limit: 100 })
    for (const key of list.keys) {
      deletions.push(kv.delete(key.name))
    }
    cursor = list.list_complete ? undefined : list.cursor
  } while (cursor)
  await Promise.all(deletions)
}

/**
 * Convenience wrapper for call sites outside /api/editor/sites/** and mcp.post.ts
 * (the two paths already covered by a blanket afterResponse hook / direct call —
 * see server/plugins/bootstrap-cache-invalidate.ts). Non-fatal: swallows KV errors
 * and missing bindings so a cache purge failure never breaks the write it follows.
 */
export async function purgeBootstrapCacheSafe(
  env: unknown,
  siteId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kv = (env as any)?.SITE_CACHE as KVNamespace | undefined
  if (!kv) return
  
  const purgePromise = purgeBootstrapCache(kv, siteId).catch(err => {
    console.warn('[bootstrap-cache] purge failed:', String(err))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const waitUntil = (env as any)?.ctx?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil.call((env as any).ctx, purgePromise)
    return
  }

  // Hard timeout fallback if waitUntil is not available
  await Promise.race([
    purgePromise,
    new Promise(resolve => setTimeout(resolve, 500))
  ])
}
