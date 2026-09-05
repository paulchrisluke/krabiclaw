import { execute, queryAll, type BatchQuery, type DbClient } from '~/server/db'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { normalizeHost } from '~/server/utils/tenant-hosts'

// KV read-through cache for public shell and page resource queries.
// Mirrors edge-cache.ts's HTML cache shape, but keyed by siteId + resource
// params instead of host + pathname — public resources are looked up by siteId
// directly, not by tenant hostname, so no hostname resolution is needed here.
//
// Cache key: public~<siteId>~v3~<contract>~<page>~<location>~<experience>~<datasets>~<blogSlug>~<locale>,
// each field percent-encoded (mirrors composables/usePublicPageRequest.ts's
// usePublicPageKey(), minus `token` — cached entries are never preview/draft-authorized,
// see the preview authorization guard in the shell and page services).
// Raised from 60s to 300s once every bootstrap-relevant write path was confirmed to call
// purgePublicResourceCache/purgePublicResourceCacheSafe (dashboard editor routes + MCP were already
// covered; location CRUD, onboarding setup/commit, and Google Places sync were a
// gap closed alongside this change — see those call sites for purgePublicResourceCacheSafe).
export const PUBLIC_RESOURCE_CACHE_TTL_SECONDS = 300

const CACHE_INVALIDATION_RETRY_AFTER_MS = 5 * 60 * 1000
const CACHE_INVALIDATION_MAX_ATTEMPTS = 5
const CACHE_INVALIDATION_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export function publicResourceCacheInvalidationQuery(
  siteId: string,
  reason: string,
): BatchQuery {
  const values = [crypto.randomUUID(), siteId, reason, new Date().toISOString()]
  return {
    query: `INSERT INTO public_resource_cache_invalidations
      (id, site_id, reason, status, attempt_count, created_at)
      VALUES (?, ?, ?, 'pending', 0, ?)`,
    params: values,
  }
}

export async function drainPublicResourceCacheInvalidations(
  db: DbClient,
  kv: KVNamespace,
  options: { limit?: number; now?: Date; freeSiteDomain: string | null | undefined },
): Promise<number> {
  const freeSiteDomain = normalizeHost(options.freeSiteDomain)
  if (!freeSiteDomain) throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN is required')
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const staleClaimCutoff = new Date(now.getTime() - CACHE_INVALIDATION_RETRY_AFTER_MS).toISOString()
  const terminalRetentionCutoff = new Date(now.getTime() - CACHE_INVALIDATION_TERMINAL_RETENTION_MS).toISOString()
  await execute(db, `
    DELETE FROM public_resource_cache_invalidations
     WHERE status IN ('processed', 'failed') AND processed_at < ?
  `, [terminalRetentionCutoff])
  await execute(db, `
    UPDATE public_resource_cache_invalidations
       SET status = 'failed', claimed_at = NULL, processed_at = ?,
           last_error = COALESCE(last_error, 'Retry limit reached')
     WHERE attempt_count >= ?
       AND (status = 'pending' OR (status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)))
  `, [nowIso, CACHE_INVALIDATION_MAX_ATTEMPTS, staleClaimCutoff])
  const rows = await queryAll<{ id: string; site_id: string; attempt_count: number }>(db, `
    SELECT id, site_id, attempt_count
      FROM public_resource_cache_invalidations
     WHERE attempt_count < ?
       AND (status = 'pending' OR (status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)))
     ORDER BY created_at ASC
     LIMIT ?
  `, [CACHE_INVALIDATION_MAX_ATTEMPTS, staleClaimCutoff, options.limit ?? 50])
  let processed = 0
  for (const row of rows) {
    const claim = await execute(db, `
      UPDATE public_resource_cache_invalidations
         SET status = 'processing', claimed_at = ?, attempt_count = attempt_count + 1
       WHERE id = ? AND attempt_count = ? AND attempt_count < ?
         AND (status = 'pending' OR (status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)))
    `, [nowIso, row.id, row.attempt_count, CACHE_INVALIDATION_MAX_ATTEMPTS, staleClaimCutoff])
    if (Number(claim.meta?.changes ?? 0) !== 1) continue
    const claimedAttemptCount = row.attempt_count + 1
    try {
      await purgePublicResourceCache(kv, row.site_id)
      const domains = await queryAll<{ domain: string }>(db, `
        SELECT domain FROM site_domains WHERE site_id = ? AND status = 'active'
      `, [row.site_id])
      const sites = await queryAll<{ subdomain: string | null; custom_domain: string | null }>(db, `
        SELECT subdomain, custom_domain FROM sites WHERE id = ? LIMIT 1
      `, [row.site_id])
      const site = sites[0]
      const hostnames = new Set<string>(domains.map(domain => domain.domain))
      if (site?.subdomain) hostnames.add(`${site.subdomain}.${freeSiteDomain}`)
      if (site?.custom_domain) hostnames.add(site.custom_domain)
      await purgeSiteKvCache(kv, [...hostnames])
      const finalized = await execute(db, `
        UPDATE public_resource_cache_invalidations
           SET status = 'processed', processed_at = ?, last_error = NULL
         WHERE id = ? AND status = 'processing' AND claimed_at = ? AND attempt_count = ?
      `, [nowIso, row.id, nowIso, claimedAttemptCount])
      if (Number(finalized.meta?.changes ?? 0) === 1) processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = claimedAttemptCount >= CACHE_INVALIDATION_MAX_ATTEMPTS
      await execute(db, `
        UPDATE public_resource_cache_invalidations
           SET status = ?, claimed_at = NULL, processed_at = ?, last_error = ?
         WHERE id = ? AND status = 'processing' AND claimed_at = ? AND attempt_count = ?
      `, [failed ? 'failed' : 'pending', failed ? nowIso : null, message.slice(0, 2000), row.id, nowIso, claimedAttemptCount])
      console.warn('[public-resource-cache] durable purge failed:', message)
    }
  }
  return processed
}

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

export function buildPublicBlawbyDocumentCacheKey(
  siteId: string,
  recipe: string,
  slug?: string | null,
  locale = 'en',
): string {
  return [
    'public',
    encodeKeyField(siteId),
    'v3',
    'blawby-document',
    encodeKeyField(recipe),
    encodeKeyField(slug),
    encodeKeyField(locale),
  ].join('~')
}

export function buildPublicResourceCacheKey(siteId: string, params: PublicResourceCacheParams): string {
  return [
    'public',
    encodeKeyField(siteId),
    'v3',
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
 * Called after any write to public-resource tables (tenant pages, products,
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
 * Convenience wrapper for call sites outside /api/editor/sites/** and mcp.post.ts.
 * When D1 is available it records a durable invalidation before attempting the
 * purge; a failed purge remains pending for the scheduled drain to retry.
 */
export async function purgePublicResourceCacheSafe(
  env: unknown,
  siteId: string,
): Promise<void> {
  const maybeEnv = env as {
    DB?: DbClient
    SITE_CACHE?: KVNamespace
    NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
    ctx?: { waitUntil?: (_promise: Promise<unknown>) => void }
  } | null | undefined
  const kv = maybeEnv?.SITE_CACHE
  if (!kv) return

  const purgePromise = maybeEnv.DB
    ? (async () => {
        const invalidation = publicResourceCacheInvalidationQuery(siteId, 'legacy-safe-wrapper')
        await execute(maybeEnv.DB!, invalidation.query, invalidation.params)
        await drainPublicResourceCacheInvalidations(maybeEnv.DB!, kv, {
          limit: 1,
          freeSiteDomain: maybeEnv.NUXT_PUBLIC_FREE_SITE_DOMAIN,
        })
      })()
    : purgePublicResourceCache(kv, siteId)

  const waitUntil = maybeEnv?.ctx?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil.call(maybeEnv?.ctx, purgePromise)
    return
  }

  // Hard timeout fallback if waitUntil is not available
  await purgePromise
}
