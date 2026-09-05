import { queryAll, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { listAccessibleLocationIds } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { getGuestThreadOperationSummary } from '~/server/domain/guest-threads/repository'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import { loadSettingsPayload } from '~/server/utils/site-settings'
import { listTenantPages } from '~/server/utils/tenant-pages'
import { listMediaAssets } from '~/server/utils/media-asset-manager'
import { getLinksPage } from '~/server/utils/site-links'

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
  media: Array<{ asset_id: string; slot: 'hero'; public_url: string; thumbnail_url: string | null; kind: string | null }>
}

export interface DashboardHomeEvent {
  id: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  location_id: string | null
  metadata: unknown
  created_at: string
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
  principal: { env: CloudflareEnv; memberId: string; userId: string; role: string },
): Promise<DashboardHomeData> {
  const accessibleLocationIds = await listAccessibleLocationIds(db, {
    env: principal.env,
    memberId: principal.memberId,
    role: principal.role,
    organizationId,
    siteId,
  })
  const scoped = accessibleLocationIds !== null
  const locationScopeClause = scoped
    ? accessibleLocationIds.length > 0 ? `AND bl.id IN (SELECT value FROM json_each(?))` : 'AND 0'
    : ''
  const eventScopeClause = scoped
    ? accessibleLocationIds.length > 0 ? `AND e.location_id IN (SELECT value FROM json_each(?))` : 'AND 0'
    : ''
  const scopedParams = accessibleLocationIds?.length ? [d1JsonStringSet(accessibleLocationIds)] : []
  const [locations, events, operations, settings, pages, media, linksPage] = await Promise.all([
    queryAll<{
      id: string; slug: string; title: string; city: string | null
      rating: number | null; review_count: number | null
      is_primary: number; status: string; updated_at: string
      address: string | null; maps_url: string | null
      latitude: number | null; longitude: number | null
      hero_asset_id: string | null; hero_kind: string | null; hero_media_public_url: string | null
      hero_media_thumbnail_url: string | null
    }>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.city, bl.rating, bl.review_count,
             bl.address, bl.maps_url, bl.latitude, bl.longitude,
             bl.is_primary, bl.status, bl.updated_at,
             ma_hero.id AS hero_asset_id, ma_hero.kind AS hero_kind,
             ma_hero.public_url AS hero_media_public_url,
             ma_hero.thumbnail_url AS hero_media_thumbnail_url
      FROM business_locations bl
      LEFT JOIN media_placements mp_hero ON mp_hero.owner_type = 'business_location' AND mp_hero.owner_id = bl.id AND mp_hero.slot = 'hero' AND mp_hero.status = 'active'
      LEFT JOIN media_assets ma_hero ON ma_hero.id = mp_hero.asset_id
        AND ma_hero.organization_id = bl.organization_id AND ma_hero.site_id = bl.site_id AND ma_hero.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ?
      ${locationScopeClause}
      ORDER BY bl.is_primary DESC, bl.title ASC
    `, [organizationId, siteId, ...scopedParams]),

    queryAll<{
      id: string; event_type: string; entity_type: string | null
      entity_id: string | null; location_id: string | null
      metadata: string | null; created_at: string
      location_title: string | null
    }>(db, `
      SELECT e.id, e.event_type, e.entity_type, e.entity_id,
             e.location_id, e.metadata, e.created_at,
             l.title as location_title
      FROM organization_events e
      LEFT JOIN business_locations l ON l.id = e.location_id
      WHERE e.organization_id = ? AND e.site_id = ?
      ${eventScopeClause}
      ORDER BY e.created_at DESC
      LIMIT 15
    `, [organizationId, siteId, ...scopedParams]),

    getGuestThreadOperationSummary(db, siteId, {
      principal: scoped && principal
        ? { env: principal.env, memberId: principal.memberId, role: principal.role, organizationId, siteId }
        : null,
      userId: principal?.userId ?? '',
    }),
    loadSettingsPayload(db, organizationId, siteId),
    listTenantPages(db, siteId),
    listMediaAssets(db, siteId, { kind: 'image', limit: 6, offset: 0 }),
    getLinksPage(db, siteId),
  ])

  return {
    locations: locations.map((l) => {
      const address = parseLocationAddress(l.address)
      const { hero_asset_id, hero_kind, hero_media_public_url, hero_media_thumbnail_url, ...location } = l
      return {
        ...location,
        is_primary: Boolean(l.is_primary),
        address,
        media: hero_asset_id && hero_media_public_url ? [{ asset_id: hero_asset_id, slot: 'hero', public_url: hero_media_public_url, thumbnail_url: hero_media_thumbnail_url, kind: hero_kind }] : [],
        map_embed_url: calculateMapEmbedUrl({ ...l, address: address?.addressLines?.[0] ?? null }),
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
