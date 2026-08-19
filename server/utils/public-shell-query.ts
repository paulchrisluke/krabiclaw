import type { BatchQuery } from '~/server/db'
import type { PublicBase } from '~/server/utils/public-base'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import type { PublicShellPayload } from '~/utils/public-resource-contracts'

type BatchResult = { results?: unknown[] }

export interface PublicShellQueryIndexes {
  locations: number
  config: number
  locales: number
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
               ORDER BY bl.is_primary DESC, bl.title ASC`, [organizationId, siteId]),
    config: push(`SELECT key, value
                FROM site_config
               WHERE organization_id = ? AND site_id = ?
              UNION ALL
              SELECT '__experience_count',
                     CAST((SELECT COUNT(*) FROM experiences WHERE site_id = ? AND status != 'inactive') AS TEXT)
              UNION ALL
              SELECT '__has_menu',
                     CAST(EXISTS(
                       SELECT 1 FROM menus
                        WHERE organization_id = ? AND site_id = ? AND is_visible = 1
                     ) AS TEXT)`, [organizationId, siteId, siteId, organizationId, siteId]),
    locales: push(`SELECT locale, label, is_source, status
                FROM site_locales
               WHERE organization_id = ? AND site_id = ?
                 AND (is_source = 1 OR status = 'published')
               ORDER BY is_source DESC, locale ASC`, [organizationId, siteId]),
  }
}

export function buildPublicShellPayload(
  site: PublicBase['site'],
  results: BatchResult[],
  indexes: PublicShellQueryIndexes,
): PublicShellPayload {
  const rawLocations = (results[indexes.locations]?.results ?? []) as Record<string, unknown>[]
  const locations = rawLocations.map(location => {
    const publicUrl = location.hero_public_url as string | null
    return {
      id: location.id,
      slug: location.slug,
      title: location.title,
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
  const configRows = (results[indexes.config]?.results ?? []) as Array<{ key: string, value: string }>
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

  return {
    site: {
      brand_name: site.brand_name,
      brand_description: site.brand_description,
      vertical: site.vertical,
      logo_url: site.logo_url,
      logo_mime_type: null,
      favicon_url: site.favicon_url,
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
    hasMenu: configRows.find(({ key }) => key === '__has_menu')?.value === '1',
  }
}
