import { queryAll, type DbClient } from '~/server/db'
import { isOrganizationWideRole, teamAccessPredicate } from '~/server/utils/member-access'
import { getGuestThreadOperationSummary } from '~/server/domain/guest-threads/repository'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import { loadSettingsPayload } from '~/server/utils/site-settings'
import { listTenantPages } from '~/server/utils/tenant-pages'
import { listMediaAssets } from '~/server/utils/media-asset-manager'
import { getLinksPage } from '~/server/utils/site-links'
import { resolveSocialImageUrl, resolveSocialOgImage } from '~/utils/social-metadata'
import { resolvePublicTemplate } from '~/utils/template-registry'

export interface DashboardHomeLocation {
  id: string
  slug: string
  title: string
  city: string | null
  rating: number | null
  review_count: number | null
  is_primary: boolean
  status: string
  updated_at: string
  address: { addressLines?: string[] } | null
  latitude: number | null
  longitude: number | null
  map_embed_url: string | null
  preview_image_url: string
}

export interface DashboardHomeEvent {
  id: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  location_id: string | null
  metadata: unknown
  created_at: string
  actor_name: string | null
  actor_image: string | null
  location_title: string | null
}

export interface DashboardHomeData {
  locations: DashboardHomeLocation[]
  events: DashboardHomeEvent[]
  operations: {
    openThreads: number
    unreadThreads: number
    reservations: number
    experienceBookings: number
  }
  settings: Awaited<ReturnType<typeof loadSettingsPayload>>
  pages: Awaited<ReturnType<typeof listTenantPages>>
  media: Array<Awaited<ReturnType<typeof listMediaAssets>>[number] & { public_url: string }>
  links: Awaited<ReturnType<typeof getLinksPage>>['items']
}

function safeJsonParse(value: string): unknown {
  return JSON.parse(value)
}

function parseLocationAddress(value: string | null): { addressLines?: string[] } | null {
  if (!value) return null
  const parsed = safeJsonParse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored location address is invalid')
  const address = parsed as { addressLines?: unknown; streetAddress?: unknown }
  if (Array.isArray(address.addressLines) && address.addressLines.every(line => typeof line === 'string')) {
    return { addressLines: address.addressLines }
  }
  if (address.addressLines !== undefined) throw new Error('Stored location address lines are invalid')
  if (typeof address.streetAddress === 'string' && address.streetAddress.trim()) {
    return { addressLines: [address.streetAddress.trim()] }
  }
  throw new Error('Stored location address is missing address lines')
}

// Shared by server/api/dashboard/home.get.ts and the site overview page's SSR
// branch — see the "Nested SSR self-fetch loses Cloudflare bindings" rule in
// the SSR boundary rule for why the page can't just $fetch its own API route.
export async function getDashboardHomeData(
  db: DbClient,
  organizationId: string,
  siteId: string,
  principal: { memberId: string; role: string; ogOrigin: string },
): Promise<DashboardHomeData> {
  const scoped = principal && !isOrganizationWideRole(principal.role)
  const locationScopeClause = scoped
    ? `AND EXISTS (
        SELECT 1
        FROM member m
        JOIN sites s ON s.id = bl.site_id
        WHERE m.id = ? AND m.organizationId = bl.organization_id
          AND ${teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id', locationTeamExpr: 'bl.team_id' })}
      )`
    : ''
  // bl.team_id is NULL when the event has no location_id (the LEFT JOIN
  // below doesn't match) — teamAccessPredicate's `tm.teamId IN (s.team_id,
  // NULL)` then degrades to matching only s.team_id, so this needs no
  // separate branch for the location-vs-site-wide event case.
  const eventScopeClause = scoped
    ? `AND EXISTS (
        SELECT 1
        FROM member m
        JOIN sites s ON s.id = e.site_id
        LEFT JOIN business_locations bl ON bl.id = e.location_id AND bl.site_id = e.site_id
        WHERE m.id = ? AND m.organizationId = e.organization_id
          AND ${teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id', locationTeamExpr: 'bl.team_id' })}
      )`
    : ''
  const [locations, events, operations, settings, pages, media, linksPage] = await Promise.all([
    queryAll<{
      id: string; slug: string; title: string; city: string | null
      rating: number | null; review_count: number | null
      is_primary: number; status: string; updated_at: string
      address: string | null; maps_url: string | null
      latitude: number | null; longitude: number | null
      vertical: string | null; theme_id: string | null; brand_name: string | null
      logo_url: string | null; favicon_url: string | null; brand_color: string | null
      hero_kind: string | null; hero_public_url: string | null
      hero_thumbnail_url: string | null; seo_title: string | null
      seo_description: string | null; short_description: string | null
    }>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.city, bl.rating, bl.review_count,
             bl.address, bl.maps_url, bl.latitude, bl.longitude,
             bl.is_primary, bl.status, bl.updated_at,
             bl.seo_title, bl.seo_description, bl.short_description,
             s.vertical, s.theme_id, s.brand_name,
             COALESCE(ma_logo.public_url, s.logo_url) AS logo_url,
             json_extract(s.settings, '$.favicon_url') AS favicon_url,
             (SELECT value FROM site_config WHERE organization_id = s.organization_id AND site_id = s.id AND key = 'brand_color' LIMIT 1) AS brand_color,
             ma_hero.kind AS hero_kind,
             ma_hero.public_url AS hero_public_url,
             ma_hero.thumbnail_url AS hero_thumbnail_url
      FROM business_locations bl
      JOIN sites s ON s.id = bl.site_id AND s.organization_id = bl.organization_id
      LEFT JOIN media_assets ma_logo ON ma_logo.id = s.logo_asset_id
        AND ma_logo.organization_id = s.organization_id AND ma_logo.site_id = s.id AND ma_logo.status = 'active'
      LEFT JOIN media_assets ma_hero ON ma_hero.id = bl.hero_media_asset_id
        AND ma_hero.organization_id = bl.organization_id AND ma_hero.site_id = bl.site_id AND ma_hero.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ?
      ${locationScopeClause}
      ORDER BY bl.is_primary DESC, bl.title ASC
    `, scoped && principal ? [organizationId, siteId, principal.memberId] : [organizationId, siteId]),

    queryAll<{
      id: string; event_type: string; entity_type: string | null
      entity_id: string | null; location_id: string | null
      metadata: string | null; created_at: string
      actor_name: string | null; actor_image: string | null
      location_title: string | null
    }>(db, `
      SELECT e.id, e.event_type, e.entity_type, e.entity_id,
             e.location_id, e.metadata, e.created_at,
             u.name as actor_name, u.image as actor_image,
             l.title as location_title
      FROM site_events e
      LEFT JOIN user u ON u.id = e.actor_id
      LEFT JOIN business_locations l ON l.id = e.location_id
      WHERE e.organization_id = ? AND e.site_id = ?
      ${eventScopeClause}
      ORDER BY e.created_at DESC
      LIMIT 15
    `, scoped && principal ? [organizationId, siteId, principal.memberId] : [organizationId, siteId]),

    getGuestThreadOperationSummary(db, siteId, {
      principal: scoped && principal
        ? { memberId: principal.memberId, role: principal.role, organizationId, siteId }
        : null,
      memberId: principal?.memberId ?? '',
    }),
    loadSettingsPayload(db, organizationId, siteId),
    listTenantPages(db, siteId),
    listMediaAssets(db, siteId, { kind: 'image', limit: 6, offset: 0 }),
    getLinksPage(db, siteId),
  ])

  return {
    locations: locations.map((l) => {
      const address = parseLocationAddress(l.address)
      const siteName = l.brand_name?.trim()
      if (!siteName) throw new Error('Cannot generate dashboard preview: site brand name is missing')
      const heroImageUrl = resolveSocialImageUrl({
        kind: l.hero_kind,
        public_url: l.hero_public_url,
        thumbnail_url: l.hero_thumbnail_url,
      })
      return {
        ...l,
        is_primary: Boolean(l.is_primary),
        address,
        map_embed_url: calculateMapEmbedUrl({ ...l, address: address?.addressLines?.[0] ?? null }),
        preview_image_url: resolveSocialOgImage({
          template: resolvePublicTemplate({ themeId: l.theme_id, vertical: l.vertical }).slug,
          title: l.seo_title?.trim() || `${l.title} | Locations`,
          description: l.seo_description || l.short_description,
          canonicalUrl: principal.ogOrigin,
          location: l.title,
          brand: {
            siteName,
            logoUrl: l.logo_url,
            faviconUrl: l.favicon_url,
            primaryColor: l.brand_color,
          },
          heroImage: heroImageUrl ? { url: heroImageUrl } : null,
        }, principal.ogOrigin).url,
      }
    }),
    events: events.map(e => ({
      ...e,
      metadata: e.metadata ? safeJsonParse(e.metadata) : null,
    })),
    operations: {
      openThreads: operations.openThreads,
      unreadThreads: operations.unreadThreads,
      reservations: operations.reservations,
      experienceBookings: operations.experienceBookings,
    },
    settings,
    pages,
    media: media.map((asset) => {
      if (!asset.public_url) throw new Error(`Active overview media asset ${asset.id} has no public URL`)
      return { ...asset, public_url: asset.public_url }
    }),
    links: linksPage.items,
  }
}
