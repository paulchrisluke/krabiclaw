import { HTTPError } from 'nitro';
import { oncePerRequest } from '~/server/utils/request-scope'

import type { H3Event } from 'nitro';
import {  setHeader } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response'
import { executeBatch, queryAll, type BatchQuery } from '~/server/db'
import { buildPublicResourceCacheKey, getPublicResourceCache, putPublicResourceCache } from '~/server/utils/public-resource-cache'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { loadPublicBase } from '~/server/utils/public-base'
import { appendPublicShellQueries, buildPublicShellPayload } from '~/server/utils/public-shell-query'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { isNonProductionHost } from '~/server/utils/tenant-hosts'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import { isPublicShellPayload } from '~/utils/public-resource-contracts'
import { assertExactCanonicalLocale, assertPublicSiteLanguageEntitlement } from '~/server/utils/localization'
import {
  indexStoredPublicLocalizations,
  projectExactLocalizedCollection,
  projectExactLocalizedResource,
  type StoredPublicLocalizationRow,
} from '~/server/utils/public-localization'

export interface PublicShellLoadOptions {
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

export async function loadPublicShellSource(
  event: H3Event,
  organizationId: string,
  query: Pick<Record<string, string | undefined>, 'locale'>,
  options: PublicShellLoadOptions = {},
) {
  options.signal?.throwIfAborted()
  const mutateHeaders = options.mutateResponseHeaders ?? true
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const locale = typeof query.locale === 'string' ? query.locale : undefined
  if (locale !== undefined) assertExactCanonicalLocale(locale)
  const previewAuthorized = await resolvePreviewAuthorization(event, organizationId, previewSecretOf(env))
  const host = (event.req.headers.get('host')) ?? ''
  const useCache = !previewAuthorized && !isNonProductionHost(host)
  const cacheKey = buildPublicResourceCacheKey(organizationId, {
    contract: 'shell',
    page: null,
    location: null,
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
          organizationId,
          error: error instanceof Error ? error.message : String(error),
        })
        const deletion = cache.delete(cacheKey).catch((deleteError: unknown) => {
          console.warn('[public-resource-cache] corrupt shell deletion failed', {
            organizationId,
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

  const { site } = await loadPublicBase(event, organizationId, { previewAuthorized })
  options.signal?.throwIfAborted()
  const shellQueries: BatchQuery[] = []
  const shellIndexes = appendPublicShellQueries(shellQueries, site.id)
  const shellResults = await executeBatch(db, shellQueries)
  options.signal?.throwIfAborted()
  const payload = {
    success: true,
    ...buildPublicShellPayload(site, shellResults, shellIndexes),
    count: shellResults[shellIndexes.locations]?.results?.length ?? 0,
    platformMessages: null as Record<string, string> | null,
  }
  if (locale && locale !== 'en') {
    const entitlement = await assertPublicSiteLanguageEntitlement(env, db, site.id, locale)
    if (entitlement.source) throw new HTTPError({ statusCode: 404, statusMessage: 'English source routes are unprefixed' })
    if (!entitlement.platform_messages) {
      throw new HTTPError({ statusCode: 500, statusMessage: 'Published platform locale messages are unavailable' })
    }
    payload.platformMessages = entitlement.platform_messages
    const localizedRows = await queryAll<StoredPublicLocalizationRow>(db, `
      SELECT resource_type, resource_id, locale, values_json, route_path
       FROM resource_localizations
       WHERE organization_id = ?  AND locale = ?
         AND resource_type IN ('organization', 'business_location')
    `, [site.id, locale])
    // The shell reads the site and its locations; neither carries metafields,
    // so no definition is in scope here.
    const localizations = indexStoredPublicLocalizations(localizedRows, new Map())
    const siteLocalization = localizations.find(item => item.resourceType === 'organization' && item.resourceId === organizationId)
    payload.locations = projectExactLocalizedCollection('business_location', payload.locations, localizations)
    const localizedSite = siteLocalization
      ? projectExactLocalizedResource('organization', { ...payload.site, id: organizationId }, siteLocalization)
      : { ...payload.site, id: organizationId, name: null, brand_description: null }
    const { id: _localizedSiteId, ...localizedSiteValues } = localizedSite
    payload.site = localizedSiteValues
    const {
      name: _sourceBrandName,
      brand_description: _sourceBrandDescription,
      seo_title: _sourceSeoTitle,
      seo_description: _sourceSeoDescription,
      ...nonLocalizedConfig
    } = payload.config
    payload.config = {
      ...nonLocalizedConfig,
      ...(typeof localizedSite.name === 'string' ? {
        name: localizedSite.name,
        seo_title: localizedSite.name,
      } : {}),
      ...(typeof localizedSite.brand_description === 'string' ? {
        brand_description: localizedSite.brand_description,
        seo_description: localizedSite.brand_description,
      } : {}),
    }
    payload.count = payload.locations.length
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
  organizationId: string,
  query: Pick<Record<string, string | undefined>, 'locale'>,
  options?: PublicShellLoadOptions,
) {
  if (options?.signal) {
    const startedAt = performance.now()
    return loadPublicShellSource(event, organizationId, query, options)
      .finally(() => recordRequestPhase(event, 'shell', startedAt))
  }
  return oncePerRequest(event, `public-shell:${organizationId}:${query.locale ?? ''}`, () => {
    const startedAt = performance.now()
    return loadPublicShellSource(event, organizationId, query, options)
      .finally(() => recordRequestPhase(event, 'shell', startedAt))
  })
}
