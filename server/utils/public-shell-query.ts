import type { BatchQuery } from '~/server/db'
import type { PublicBase } from '~/server/utils/public-base'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import type { PublicShellPayload } from '~/utils/public-resource-contracts'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { isCurrencyCode } from '~/shared/currencies'

type BatchResult = { results?: unknown[] }

const requireLocationString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Public location ${field} is unavailable`)
  }
  return value
}

export interface PublicShellQueryIndexes {
  locations: number
  config: number
  locales: number
  productLocations: number
}

export function appendPublicShellQueries(
  queries: BatchQuery[],
  organizationId: string,
  siteId: string,
): PublicShellQueryIndexes {
  const push = (query: string, params: unknown[]) => {
    const index = queries.length
    queries.push({ query, params })
    return index
  }

  return {
    locations: push(`SELECT bl.id, bl.slug, bl.title, bl.address, bl.phone, bl.email,
                     bl.website_url, bl.maps_url, bl.latitude, bl.longitude,
                     bl.opening_hours, bl.special_hours, bl.timezone, bl.rating,
                     bl.review_count, bl.is_primary, bl.status, bl.city,
                     bl.neighborhood, bl.grab_url, bl.uber_eats_url,
                     bl.foodpanda_url, bl.description, bl.short_description,
                     bl.last_synced_at, bl.seo_title, bl.seo_description,
                     bl.canonical_url, bl.robots, bl.feature_overrides, mp.asset_id AS asset_id,
                     ma.public_url AS media_public_url, ma.thumbnail_url AS media_thumbnail_url, ma.kind AS media_kind
                FROM business_locations bl
                LEFT JOIN media_placements mp ON mp.site_id = bl.site_id AND mp.owner_type = 'business_location' AND mp.owner_id = bl.id AND mp.slot = 'hero' AND mp.sort_order = 0 AND mp.status = 'active'
                LEFT JOIN media_assets ma ON mp.asset_id = ma.id
                  AND ma.status = 'active'
                  AND ma.organization_id = bl.organization_id
                  AND ma.site_id = bl.site_id
               WHERE bl.organization_id = ? AND bl.site_id = ? AND bl.status = 'active'
               ORDER BY bl.is_primary DESC, bl.title ASC`, [organizationId, siteId]),
    config: push(`SELECT key, value
                FROM site_config
               WHERE organization_id = ? AND site_id = ?
              UNION ALL
              SELECT '__experience_count',
                     CAST((SELECT COUNT(*) FROM experiences e JOIN products p ON p.id = e.id WHERE e.site_id = ? AND p.is_visible = 1) AS TEXT)
              `, [organizationId, siteId, siteId]),
    locales: push(`SELECT locale, label, is_source, status
                FROM site_locales
               WHERE organization_id = ? AND site_id = ?
                 AND (is_source = 1 OR status = 'published')
               ORDER BY is_source DESC, locale ASC`, [organizationId, siteId]),
    productLocations: push(`SELECT DISTINCT location_id
                              FROM products
                             WHERE organization_id = ? AND site_id = ? AND product_type = 'standard' AND is_visible = 1
                             ORDER BY location_id`, [organizationId, siteId]),
  }
}

export function buildPublicShellPayload(
  site: PublicBase['site'],
  results: BatchResult[],
  indexes: PublicShellQueryIndexes,
): PublicShellPayload {
  const rawLocations = (results[indexes.locations]?.results ?? []) as Record<string, unknown>[]
  const locations = rawLocations.map(location => {
    const publicUrl = location.media_public_url as string | null
    return {
      id: requireLocationString(location.id, 'id'),
      slug: requireLocationString(location.slug, 'slug'),
      title: requireLocationString(location.title, 'title'),
      address: location.address ? JSON.parse(String(location.address)) : null,
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
      opening_hours: location.opening_hours ? JSON.parse(String(location.opening_hours)) : null,
      special_hours: location.special_hours ? JSON.parse(String(location.special_hours)) : null,
      timezone: location.timezone ?? null,
      rating: location.rating,
      review_count: location.review_count,
      is_primary: Boolean(location.is_primary),
      status: location.status,
      media: publicUrl ? [{ asset_id: location.asset_id, slot: 'hero', public_url: publicUrl, thumbnail_url: location.media_thumbnail_url, kind: location.media_kind }] : [],
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
    }
  })
  const configRows = (results[indexes.config]?.results ?? []) as Array<{ key: string, value: string }>
  const config: Record<string, string> = Object.fromEntries(
    configRows.filter(({ key }) => !key.startsWith('__')).map(({ key, value }) => [key, value]),
  )
  if (!isCurrencyCode(site.default_currency)) throw new Error(`Unsupported site currency: ${site.default_currency}`)
  config.default_currency = site.default_currency
  if (site.contact_email) config.contact_email = site.contact_email
  if (site.contact_phone) config.contact_phone = site.contact_phone
  if (site.brand_name) config.brand_name = site.brand_name
  if (site.brand_description) config.brand_description = site.brand_description
  if (site.seo_title) config.seo_title = site.seo_title
  if (site.seo_description) config.seo_description = site.seo_description
  if (site.canonical_url) config.canonical_url = site.canonical_url
  if (site.robots) config.robots = site.robots
  // Real, writable site-scope columns — the single source for footer social icons. Never
  // derived from site_link_items (a link's destination and a footer profile are unrelated).
  if (site.social_facebook_url) config.social_facebook = site.social_facebook_url
  if (site.social_instagram_url) config.social_instagram = site.social_instagram_url
  if (site.social_tiktok_url) config.social_tiktok = site.social_tiktok_url

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

  return {
    site: {
      brand_name: site.brand_name,
      brand_description: site.brand_description,
      vertical: site.vertical,
      media: site.media,
      config: { phone: site.contact_phone },
    },
    locations,
    config,
    googleBusiness: {
      business: primary
        ? {
            title: primary.title,
            city: primary.city,
            storefrontAddress: primary.address ? JSON.parse(String(primary.address)) : null,
            phoneNumbers: primary.phone ? [{ phoneNumber: primary.phone }] : [],
            websiteUri: primary.website_url,
            mapsUri: primary.maps_url,
            latlng: primary.latitude != null && primary.longitude != null
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
    locales: ((results[indexes.locales]?.results ?? []) as Array<{
      locale: string, label: string | null, is_source: number
    }>).map(locale => ({
      code: locale.locale,
      label: locale.label ?? locale.locale,
      is_source: Boolean(locale.is_source),
    })),
    hasExperiences: Number(configRows.find(({ key }) => key === '__experience_count')?.value ?? 0) > 0,
    hasProducts: (() => {
      const productLocationIds = new Set(((results[indexes.productLocations]?.results ?? []) as Array<{ location_id: string }>).map(row => row.location_id))
      return rawLocations.some((location) => {
        if (!productLocationIds.has(String(location.id))) return false
        const { capabilities } = resolveSiteCmsCapabilities(String(site.vertical), site.theme_id, {
          siteEnabledFeatures: site.feature_overrides,
          locationEnabledFeatures: location.feature_overrides as string | null,
        })
        return capabilities.managers.some(manager => manager.key === 'location.products')
      })
    })(),
  }
}
