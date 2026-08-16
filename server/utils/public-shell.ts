import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro';
import {  setHeader } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response'
import { executeBatch, type BatchQuery } from '~/server/db'
import { buildPublicResourceCacheKey, getPublicResourceCache, putPublicResourceCache } from '~/server/utils/public-resource-cache'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { loadPublicBase } from '~/server/utils/public-base'
import { appendPublicShellQueries, buildPublicShellPayload } from '~/server/utils/public-shell-query'
import { verifyPreviewToken } from '~/server/utils/preview-token'
import { isPreviewContext } from '~/server/utils/tenant-hosts'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import { isPublicShellPayload } from '~/utils/public-resource-contracts'

export interface PublicShellLoadOptions {
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

const readsByRequest = new WeakMap<H3Event, Map<string, Promise<unknown>>>()

export async function loadPublicShellSource(
  event: H3Event,
  siteId: string,
  query: Pick<Record<string, string | undefined>, 'locale' | 'token'>,
  options: PublicShellLoadOptions = {},
) {
  options.signal?.throwIfAborted()
  const mutateHeaders = options.mutateResponseHeaders ?? true
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const token = typeof query.token === 'string' ? query.token : null
  const locale = typeof query.locale === 'string' ? query.locale : undefined
  if (locale !== undefined && !/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Invalid public shell locale' })
  }
  const previewAuthorized = Boolean(
    token && env.PREVIEW_SECRET
      ? await verifyPreviewToken(String(env.PREVIEW_SECRET), siteId, token)
      : false,
  )
  const host = (event.req.headers.get('host')) ?? ''
  const useCache = !previewAuthorized && !isPreviewContext(host)
  const cacheKey = buildPublicResourceCacheKey(siteId, {
    contract: 'shell',
    page: null,
    location: null,
    experience: null,
    datasets: [],
    blogSlug: null,
    locale,
  })
  const cache = env.SITE_CACHE
  if (mutateHeaders) {
    setHeader(event, 'cache-control', previewAuthorized
      ? 'private, no-store'
      : 'public, max-age=60, stale-while-revalidate=300')
  }
  if (useCache && cache) {
    const cacheStartedAt = performance.now()
    const cached = await getPublicResourceCache(cache, cacheKey)
    recordRequestPhase(event, 'cache', cacheStartedAt)
    options.signal?.throwIfAborted()
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as unknown
        if (!isPublicShellPayload(parsed)) throw new Error('Shell cache contract mismatch')
        if (mutateHeaders) setHeader(event, 'x-bootstrap-cache', 'HIT')
        return parsed
      } catch (error) {
        console.warn('[public-resource-cache] corrupt shell entry', {
          siteId,
          error: error instanceof Error ? error.message : String(error),
        })
        const deletion = cache.delete(cacheKey).catch((deleteError: unknown) => {
          console.warn('[public-resource-cache] corrupt shell deletion failed', {
            siteId,
            error: String(deleteError),
          })
        })
        getCloudflareWaitUntil(event)?.(deletion)
      }
    }
    if (mutateHeaders) setHeader(event, 'x-bootstrap-cache', 'MISS')
  } else if (mutateHeaders) {
    setHeader(event, 'x-bootstrap-cache', useCache ? 'NO-KV' : 'SKIP')
  }

  const { site } = await loadPublicBase(event, siteId, { previewAuthorized })
  options.signal?.throwIfAborted()
  const shellQueries: BatchQuery[] = []
  const shellIndexes = appendPublicShellQueries(shellQueries, site.organization_id, siteId)
  const shellResults = await executeBatch(db, shellQueries)
  options.signal?.throwIfAborted()
  const payload = {
    success: true,
    ...buildPublicShellPayload(site, shellResults, shellIndexes),
    count: shellResults[shellIndexes.locations]?.results?.length ?? 0,
  }
  if (useCache && cache) {
    const write = putPublicResourceCache(cache, cacheKey, JSON.stringify(payload))
      .catch(error => console.warn('[public-resource-cache] shell put failed:', String(error)))
    const waitUntil = getCloudflareWaitUntil(event)
    if (waitUntil) waitUntil(write)
  }
  return payload
}

export function loadPublicShell(
  event: H3Event,
  siteId: string,
  query: Pick<Record<string, string | undefined>, 'locale' | 'token'>,
  options?: PublicShellLoadOptions,
) {
  if (options?.signal) {
    const startedAt = performance.now()
    return loadPublicShellSource(event, siteId, query, options)
      .finally(() => recordRequestPhase(event, 'shell', startedAt))
  }
  let reads = readsByRequest.get(event)
  if (!reads) {
    reads = new Map()
    readsByRequest.set(event, reads)
  }
  const key = `${siteId}:${query.locale ?? ''}:${query.token ?? ''}`
  const existing = reads.get(key)
  if (existing) return existing
  const startedAt = performance.now()
  const operation = loadPublicShellSource(event, siteId, query, options)
  const pending = operation
    .finally(() => recordRequestPhase(event, 'shell', startedAt))
    .catch(error => {
      if (reads.get(key) === pending) reads.delete(key)
      throw error
    })
  reads.set(key, pending)
  return pending
}
