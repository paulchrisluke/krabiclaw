import { execute, queryAll, type BatchQuery, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'
import { syncSiteSearchIndex } from '~/server/utils/public-search'
import { normalizeHost } from '~/server/utils/tenant-hosts'

// KV read-through cache for public shell and page resource queries.
// Mirrors edge-cache.ts's HTML cache shape, but keyed by organizationId + resource
// params instead of host + pathname — public resources are looked up by organizationId
// directly, not by tenant hostname, so no hostname resolution is needed here.
//
// Cache key: public~<organizationId>~v4~<contract>~<page>~<location>~<datasets>~<blogSlug>~<locale>,
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

/**
 * "This site changed." One row per write, in the write's own batch, so the
 * record is atomic with the change. The drainer turns each row into whatever
 * has to follow a change to the site: its caches are cleared and its slice of
 * the search index is brought up to date.
 */
export function publicResourceCacheInvalidationQuery(
  organizationId: string,
  reason: string,
): BatchQuery {
  const values = [crypto.randomUUID(), organizationId, reason, new Date().toISOString()]
  return {
    query: `INSERT INTO public_resource_cache_invalidations
      (id, organization_id, reason, status, attempt_count, created_at)
      VALUES (?, ?, ?, 'pending', 0, ?)`,
    params: values,
  }
}

export type SiteChangeDrainEnv = Pick<CloudflareEnv, 'AI_SEARCH' | 'AI_SEARCH_INSTANCE_ID' | 'NUXT_PUBLIC_FREE_SITE_DOMAIN'>

export async function drainPublicResourceCacheInvalidations(
  db: DbClient,
  kv: KVNamespace,
  env: SiteChangeDrainEnv,
  options: { limit?: number; now?: Date; organizationId?: string },
): Promise<number> {
  const freeSiteDomain = normalizeHost(env.NUXT_PUBLIC_FREE_SITE_DOMAIN)
  if (!freeSiteDomain) throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN is required')
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const staleClaimCutoff = new Date(now.getTime() - CACHE_INVALIDATION_RETRY_AFTER_MS).toISOString()
  const terminalRetentionCutoff = new Date(now.getTime() - CACHE_INVALIDATION_TERMINAL_RETENTION_MS).toISOString()
  await execute(db, `
    DELETE FROM public_resource_cache_invalidations
     WHERE status IN ('processed', 'failed') AND processed_at < ?
       ${options.organizationId ? 'AND organization_id = ?' : ''}
  `, [terminalRetentionCutoff, ...(options.organizationId ? [options.organizationId] : [])])
  await execute(db, `
    UPDATE public_resource_cache_invalidations
       SET status = 'failed', claimed_at = NULL, processed_at = ?,
           last_error = COALESCE(last_error, 'Retry limit reached')
     WHERE attempt_count >= ?
       AND (status = 'pending' OR (status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)))
       ${options.organizationId ? 'AND organization_id = ?' : ''}
  `, [nowIso, CACHE_INVALIDATION_MAX_ATTEMPTS, staleClaimCutoff, ...(options.organizationId ? [options.organizationId] : [])])
  const rows = await queryAll<{ id: string; organization_id: string; attempt_count: number }>(db, `
    SELECT id, organization_id, attempt_count
      FROM public_resource_cache_invalidations
     WHERE attempt_count < ?
       AND (status = 'pending' OR (status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)))
       ${options.organizationId ? 'AND organization_id = ?' : ''}
     ORDER BY created_at ASC
     LIMIT ?
  `, [CACHE_INVALIDATION_MAX_ATTEMPTS, staleClaimCutoff, ...(options.organizationId ? [options.organizationId] : []), options.limit ?? 50])
  let processed = 0
  // Several rows for one site in one drain are one change to converge on: the
  // site's slice is listed and diffed once, and the rest of its rows ride along.
  const syncedSites = new Set<string>()
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
      await purgeSiteCaches(db, kv, row.organization_id, freeSiteDomain)
      // A process without the binding has no index to keep: `nuxt dev`, where
      // the binding is remote-only, and the test runtime. The served worker
      // (`wrangler dev`) and every deploy have it and keep it.
      if (env.AI_SEARCH && !import.meta.dev && !syncedSites.has(row.organization_id)) {
        const synced = await syncSiteSearchIndex(env as CloudflareEnv, db, row.organization_id)
        syncedSites.add(row.organization_id)
        // A bounded run that left uploads behind is not a failure to retry; it
        // is more of the same change, so it goes back on the queue as a new row.
        if (synced.pending > 0) {
          const more = publicResourceCacheInvalidationQuery(row.organization_id, 'search-sync-continue')
          await execute(db, more.query, more.params ?? [])
        }
      }
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
  datasets: readonly string[]
  blogSlug: string | null
  locale: string | undefined
}

// encodeURIComponent doesn't escape "~", so we replace it explicitly to avoid
// delimiter collisions (mirrors composables/usePublicPageRequest.ts).
const encodeKeyField = (value: string | null | undefined): string =>
  encodeURIComponent(value ?? '').replace(/~/g, '%7E')

export function buildPublicBlawbyDocumentCacheKey(
  organizationId: string,
  recipe: string,
  slug?: string | null,
  locale = 'en',
): string {
  return [
    'public',
    encodeKeyField(organizationId),
    'v4',
    'blawby-document',
    encodeKeyField(recipe),
    encodeKeyField(slug),
    encodeKeyField(locale),
  ].join('~')
}

export function buildPublicResourceCacheKey(organizationId: string, params: PublicResourceCacheParams): string {
  return [
    'public',
    encodeKeyField(organizationId),
    'v4',
    params.contract,
    encodeKeyField(params.page),
    encodeKeyField(params.location),
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
 */
/**
 * Clear both caches this site is served from: its public resource entries and
 * the HTML entries under every hostname it answers on.
 *
 * This is the purge itself, with none of the queue's bookkeeping around it —
 * the drainer wraps it in claiming and retries, and a write path calls it
 * directly so what it just wrote cannot be read back stale.
 */
export async function purgeSiteCaches(db: DbClient, kv: KVNamespace, organizationId: string, freeSiteDomainInput?: string | null): Promise<void> {
  const freeSiteDomain = normalizeHost(freeSiteDomainInput)
  const [domains, sites] = await Promise.all([
    queryAll<{ domain: string }>(db, "SELECT domain FROM organization_domains WHERE organization_id = ? AND status = 'active'", [organizationId]),
    queryAll<{ subdomain: string | null }>(db, 'SELECT subdomain FROM organization WHERE id = ? LIMIT 1', [organizationId]),
  ])
  const hostnames = new Set<string>(domains.map(domain => domain.domain))
  const subdomain = sites[0]?.subdomain
  if (subdomain && freeSiteDomain) hostnames.add(`${subdomain}.${freeSiteDomain}`)
  await Promise.all([purgePublicResourceCache(kv, organizationId), purgeSiteKvCache(kv, [...hostnames])])
}

export async function purgePublicResourceCache(kv: KVNamespace, organizationId: string): Promise<void> {
  const prefix = `public~${encodeKeyField(organizationId)}~`
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
 * Convenience wrapper for call sites outside /api/editor/organizations/** and mcp.post.ts.
 * When D1 is available it records a durable invalidation before attempting the
 * purge; a failed purge remains pending for the scheduled drain to retry.
 */
export async function purgePublicResourceCacheSafe(
  env: unknown,
  organizationId: string,
): Promise<void> {
  const maybeEnv = env as {
    DB?: DbClient
    SITE_CACHE?: KVNamespace
    NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
    ctx?: { waitUntil?: (_promise: Promise<unknown>) => void }
  } | null | undefined
  const kv = maybeEnv?.SITE_CACHE
  if (!kv) return

  // This request clears its own site's entries, so nothing it wrote can be
  // read back stale. Everything else — the retention sweep, retry bookkeeping,
  // claiming, the domain and site reads — belongs to the drainer, which runs
  // on its own schedule rather than inside a mutation's response time. The
  // queued row is what makes every other worker converge.
  const purgePromise = maybeEnv.DB
    ? (async () => {
        const invalidation = publicResourceCacheInvalidationQuery(organizationId, 'write-through-purge')
        await Promise.all([
          execute(maybeEnv.DB!, invalidation.query, invalidation.params),
          purgeSiteCaches(maybeEnv.DB!, kv, organizationId, maybeEnv.NUXT_PUBLIC_FREE_SITE_DOMAIN),
        ])
      })()
    : purgePublicResourceCache(kv, organizationId)

  const waitUntil = maybeEnv?.ctx?.waitUntil
  if (typeof waitUntil === 'function') {
    waitUntil.call(maybeEnv?.ctx, purgePromise)
    return
  }

  // Hard timeout fallback if waitUntil is not available
  await purgePromise
}
