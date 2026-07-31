// KV read-through cache for public shell and page resource queries.
// Mirrors edge-cache.ts's HTML cache shape, but keyed by siteId + resource
// params instead of host + pathname — public resources are looked up by siteId
// directly, not by tenant hostname, so no hostname resolution is needed here.
//
// Cache key: public~<siteId>~<contract>~<page>~<location>~<experience>~<datasets>~<blogSlug>~<locale>,
// each field percent-encoded (mirrors composables/usePublicPageRequest.ts's
// usePublicPageKey(), minus `token` — cached entries are never preview/draft-authorized,
// see the preview authorization guard in the shell and page services).
// Raised from 60s to 300s once every bootstrap-relevant write path was confirmed to call
// purgePublicResourceCache/purgePublicResourceCacheSafe (dashboard editor routes + MCP were already
// covered; location CRUD, onboarding setup/commit, and Google Business/Places sync were a
// gap closed alongside this change — see those call sites for purgePublicResourceCacheSafe).
export const PUBLIC_RESOURCE_CACHE_TTL_SECONDS = 300

export interface PublicResourceCacheParams {
  contract: 'shell' | 'page'
  page: string | null
  location: string | null
  experience: string | null
  datasets: readonly string[]
  blogSlug: string | null
  locale: string | undefined
}

// encodeURIComponent doesn't escape "~", so we replace it explicitly to avoid
// delimiter collisions (mirrors composables/usePublicPageRequest.ts).
const encodeKeyField = (value: string | null | undefined): string =>
  encodeURIComponent(value ?? '').replace(/~/g, '%7E')

export function buildPublicResourceCacheKey(siteId: string, params: PublicResourceCacheParams): string {
  return [
    'public',
    encodeKeyField(siteId),
    params.contract,
    encodeKeyField(params.page),
    encodeKeyField(params.location),
    encodeKeyField(params.experience),
    encodeKeyField([...params.datasets].sort().join(',')),
    encodeKeyField(params.blogSlug),
    encodeKeyField(params.locale),
  ].join('~')
}

export async function getPublicResourceCache(kv: KVNamespace, key: string): Promise<string | null> {
  try {
    return await kv.get(key, 'text')
  } catch {
    return null
  }
}

export async function putPublicResourceCache(
  kv: KVNamespace,
  key: string,
  body: string,
  ttlSeconds: number = PUBLIC_RESOURCE_CACHE_TTL_SECONDS,
): Promise<void> {
  await kv.put(key, body, { expirationTtl: ttlSeconds })
}

/**
 * Purge all cached public resource entries for a site.
 * Called after any write to public-resource tables (site_content, menus,
 * business_locations, experiences, blog_posts, location_qa, media_assets,
 * site_config, site_locales) so the next read reflects the edit immediately
 * instead of waiting out the TTL.
 *
 * KV keys are structured as: public~<siteId>~...
 * We list by prefix public~<siteId>~ and delete all matches.
 */
export async function purgePublicResourceCache(kv: KVNamespace, siteId: string): Promise<void> {
  const prefix = `public~${encodeKeyField(siteId)}~`
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
 * see server/plugins/public-resource-cache-invalidate.ts). Non-fatal: swallows KV errors
 * and missing bindings so a cache purge failure never breaks the write it follows.
 */
export async function purgePublicResourceCacheSafe(
  env: unknown,
  siteId: string,
): Promise<void> {
  const maybeEnv = env as { SITE_CACHE?: KVNamespace; ctx?: { waitUntil?: (_promise: Promise<unknown>) => void } } | null | undefined
  const kv = maybeEnv?.SITE_CACHE
  if (!kv) return
  
  const purgePromise = purgePublicResourceCache(kv, siteId).catch(err => {
    console.warn('[public-resource-cache] purge failed:', String(err))
  })

  const waitUntil = maybeEnv?.ctx?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil.call(maybeEnv?.ctx, purgePromise)
    return
  }

  // Hard timeout fallback if waitUntil is not available
  await Promise.race([
    purgePromise,
    new Promise(resolve => setTimeout(resolve, 500))
  ])
}
