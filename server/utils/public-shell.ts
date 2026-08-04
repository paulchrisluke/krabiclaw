import { getHeader, setHeader, type H3Event } from 'h3'
import { executeBatch } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { buildPublicResourceCacheKey, getPublicResourceCache, putPublicResourceCache } from '~/server/utils/public-resource-cache'
import { calculateMapEmbedUrl } from '~/server/utils/google-business'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { loadPublicBase } from '~/server/utils/public-base'
import { verifyPreviewToken } from '~/server/utils/preview-token'
import { isPreviewContext } from '~/server/utils/tenant-hosts'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import { isPublicShellPayload } from '~/utils/public-resource-contracts'

export interface PublicShellLoadOptions {
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

const readsByRequest = new WeakMap<H3Event, Map<string, Promise<unknown>>>()

function parseJson(raw: string | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

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
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const token = typeof query.token === 'string' ? query.token : null
  const locale = typeof query.locale === 'string' ? query.locale : undefined
  if (locale !== undefined && !/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid public shell locale' })
  }
  const previewAuthorized = Boolean(
    token && env.PREVIEW_SECRET
      ? await verifyPreviewToken(String(env.PREVIEW_SECRET), siteId, token)
      : false,
  )
  const host = getHeader(event, 'host') ?? ''
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
  const [locationsResult, configResult, localesResult] = await executeBatch(db, [
    {
      query: `SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email,
                     bl.website_url, bl.maps_url, bl.latitude, bl.longitude,
                     bl.opening_hours, bl.special_hours, bl.timezone, bl.rating,
                     bl.review_count, bl.is_primary, bl.status, bl.city,
                     bl.neighborhood, bl.grab_url, bl.uber_eats_url,
                     bl.foodpanda_url, bl.description, bl.short_description,
                     bl.last_synced_at, bl.seo_title, bl.seo_description,
                     bl.canonical_url, bl.robots, ma.public_url AS hero_public_url,
                     ma.thumbnail_url AS hero_thumbnail_url, ma.kind AS hero_kind,
                     ma_og.public_url AS og_image_public_url
                FROM business_locations bl
                LEFT JOIN media_assets ma ON bl.hero_media_asset_id = ma.id
                  AND ma.status = 'active'
                  AND ma.organization_id = bl.organization_id
                  AND ma.site_id = bl.site_id
                LEFT JOIN media_assets ma_og ON bl.og_image_asset_id = ma_og.id
                  AND ma_og.status = 'active'
                  AND ma_og.organization_id = bl.organization_id
                  AND ma_og.site_id = bl.site_id
               WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
               ORDER BY bl.is_primary DESC, bl.title ASC`,
      params: [site.organization_id, siteId],
    },
    {
      query: `SELECT key, value
                FROM site_config
               WHERE organization_id = ? AND site_id = ?
              UNION ALL
              SELECT '__experience_count',
                     CAST((SELECT COUNT(*) FROM experiences WHERE site_id = ? AND status != 'inactive') AS TEXT)
              UNION ALL
              SELECT '__has_menu',
                     CAST(EXISTS(
                       SELECT 1 FROM menus
                        WHERE organization_id = ? AND site_id = ? AND status = 'published'
                     ) AS TEXT)`,
      params: [site.organization_id, siteId, siteId, site.organization_id, siteId],
    },
    {
      query: `SELECT locale, label, is_source, status
                FROM site_locales
               WHERE organization_id = ? AND site_id = ?
                 AND (is_source = 1 OR status = 'published')
               ORDER BY is_source DESC, locale ASC`,
      params: [site.organization_id, siteId],
    },
  ])
  options.signal?.throwIfAborted()

  const rawLocations = (locationsResult?.results ?? []) as Record<string, unknown>[]
  const locations = rawLocations.map(location => {
    const publicUrl = location.hero_public_url as string | null
    return {
      id: location.id,
      slug: location.slug,
      title: location.title,
      address: parseJson(location.address as string | null),
      phone: location.phone,
      email: location.email ?? null,
      website_url: location.website_url,
      maps_url: location.maps_url,
      map_embed_url: calculateMapEmbedUrl({
        title: String(location.title),
        maps_url: location.maps_url as string | null,
        latitude: location.latitude as number | null,
        longitude: location.longitude as number | null,
        address: location.address as string | null,
        city: location.city as string | null,
      }),
      latitude: location.latitude,
      longitude: location.longitude,
      opening_hours: parseJson(location.opening_hours as string | null),
      special_hours: parseJson(location.special_hours as string | null),
      timezone: location.timezone ?? null,
      rating: location.rating,
      review_count: location.review_count,
      is_primary: Boolean(location.is_primary),
      status: location.status,
      public_url: publicUrl,
      kind: publicUrl ? location.hero_kind : null,
      hero_public_url: publicUrl,
      thumbnail_url: location.hero_thumbnail_url,
      city: location.city,
      neighborhood: location.neighborhood ?? null,
      short_description: location.short_description ?? null,
      description: location.description ?? null,
      grab_url: location.grab_url ?? null,
      uber_eats_url: location.uber_eats_url ?? null,
      foodpanda_url: location.foodpanda_url ?? null,
      seo_title: location.seo_title ?? null,
      seo_description: location.seo_description ?? null,
      canonical_url: location.canonical_url ?? null,
      robots: location.robots ?? null,
      og_image_public_url: location.og_image_public_url ?? null,
    }
  })
  const configRows = (configResult?.results ?? []) as Array<{ key: string, value: string }>
  const config: Record<string, string> = Object.fromEntries(
    configRows.filter(({ key }) => !key.startsWith('__')).map(({ key, value }) => [key, value]),
  )
  config.default_currency = site.default_currency || 'THB'
  if (site.contact_email) config.contact_email = site.contact_email
  if (site.contact_phone) config.contact_phone = site.contact_phone
  if (site.brand_name) config.brand_name = site.brand_name
  if (site.brand_description) config.brand_description = site.brand_description
  if (site.logo_url) config.logo_url = site.logo_url
  if (site.favicon_url) config.favicon_url = site.favicon_url
  if (site.og_image_url) config.og_image_url = site.og_image_url
  if (site.seo_title) config.seo_title = site.seo_title
  if (site.seo_description) config.seo_description = site.seo_description
  if (site.canonical_url) config.canonical_url = site.canonical_url
  if (site.robots) config.robots = site.robots

  const primary = rawLocations.find(location => location.is_primary) ?? rawLocations[0] ?? null
  const verifiedLocations = rawLocations.filter(
    location => location.last_synced_at && location.rating != null && location.review_count != null,
  )
  const reviewCount = verifiedLocations.reduce((sum, location) => sum + Number(location.review_count), 0)
  const reviewSummary = reviewCount > 0
    ? {
        averageRating: Math.round(
          verifiedLocations.reduce(
            (sum, location) => sum + Number(location.rating) * Number(location.review_count),
            0,
          ) / reviewCount * 10,
        ) / 10,
        totalReviewCount: reviewCount,
      }
    : null
  const payload = {
    success: true,
    locations,
    config,
    googleBusiness: {
      business: primary
        ? {
            title: primary.title,
            city: primary.city,
            storefrontAddress: parseJson(primary.address as string | null),
            phoneNumbers: primary.phone ? [{ phoneNumber: primary.phone }] : [],
            websiteUri: primary.website_url,
            mapsUri: primary.maps_url,
            latlng: primary.latitude && primary.longitude
              ? { latitude: primary.latitude, longitude: primary.longitude }
              : null,
            profile: { description: primary.description },
            reviewSummary,
          }
        : null,
      reviews: [],
      media: [],
      posts: [],
      syncedAt: primary?.last_synced_at ?? null,
    },
    count: locations.length,
    locales: ((localesResult?.results ?? []) as Array<{
      locale: string, label: string | null, is_source: number
    }>).map(locale => ({
      code: locale.locale,
      label: locale.label ?? locale.locale,
      is_source: Boolean(locale.is_source),
    })),
    hasExperiences: Number(configRows.find(({ key }) => key === '__experience_count')?.value ?? 0) > 0,
    hasMenu: configRows.find(({ key }) => key === '__has_menu')?.value === '1',
    site: {
      brand_name: site.brand_name,
      brand_description: site.brand_description,
      vertical: site.vertical,
      logo_url: site.logo_url,
      logo_mime_type: null,
      favicon_url: site.favicon_url,
      config: { phone: site.contact_phone },
    },
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
