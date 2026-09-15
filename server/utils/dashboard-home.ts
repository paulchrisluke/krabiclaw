import { queryAll, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { listAccessibleLocationIds } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { getGuestThreadOperationSummary } from '~/server/domain/guest-threads/repository'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import { loadSettingsPayload } from '~/server/utils/site-settings'
import { listTenantPages } from '~/server/utils/content/pages'
import { listMediaAssets } from '~/server/utils/media-asset-manager'
import { getLinksPage } from '~/server/utils/site-links'

export interface DashboardHomeLocation {
  id: string
  slug: string
  title: string
  city: string | null
  rating: number | null
  review_count: number | null
  status: string
  updated_at: string
  address: { addressLines?: string[] } | null
  latitude: number | null
  longitude: number | null
  map_embed_url: string | null
  media: Array<{ asset_id: string; slot: 'social_card'; public_url: string; thumbnail_url: string | null; kind: string | null }>
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
  principal: { env: CloudflareEnv; userId: string; role: string },
): Promise<DashboardHomeData> {
  const accessibleLocationIds = await listAccessibleLocationIds(db, {
    env: principal.env,
    userId: principal.userId,
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
    status: string; updated_at: string
      address: string | null; maps_url: string | null
      latitude: number | null; longitude: number | null
      card_asset_id: string | null; card_kind: string | null; card_public_url: string | null
      card_thumbnail_url: string | null
    }>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.city, bl.rating, bl.review_count,
             bl.address, bl.maps_url, bl.latitude, bl.longitude,
             bl.status, bl.updated_at,
             ma_card.id AS card_asset_id, ma_card.kind AS card_kind,
             ma_card.public_url AS card_public_url,
             ma_card.thumbnail_url AS card_thumbnail_url
      FROM business_locations bl
      -- The generated social card, the same image the locations list and the
      -- public page use, so the three cannot show a location differently.
      LEFT JOIN media_placements mp_card ON mp_card.owner_type = 'business_location' AND mp_card.owner_id = bl.id AND mp_card.slot = 'social_card' AND mp_card.status = 'active'
      LEFT JOIN media_assets ma_card ON ma_card.id = mp_card.asset_id
        AND ma_card.organization_id = bl.organization_id AND ma_card.site_id = bl.site_id AND ma_card.status = 'active'
      WHERE bl.organization_id = ? AND bl.site_id = ?
      ${locationScopeClause}
      ORDER BY bl.title ASC
    `, [organizationId, siteId, ...scopedParams]),

    queryAll<{
      id: string; event_type: string; entity_type: string | null
      entity_id: string | null; location_id: string | null
      metadata: string | null; created_at: string
      location_title: string | null
    }>(db, `
      SELECT e.id, e.event_name AS event_type, json_extract(e.payload_json, '$.entityType') AS entity_type, json_extract(e.payload_json, '$.entityId') AS entity_id,
             e.location_id, json_extract(e.payload_json, '$.metadata') AS metadata, e.created_at,
             l.title as location_title
      FROM activity_entries e
    LEFT JOIN sites event_site ON event_site.id = e.site_id
      LEFT JOIN business_locations l ON l.id = e.location_id
      WHERE e.kind = 'audit' AND event_site.organization_id = ? AND e.site_id = ?
      ${eventScopeClause}
      ORDER BY e.created_at DESC
      LIMIT 15
    `, [organizationId, siteId, ...scopedParams]),

    getGuestThreadOperationSummary(db, siteId, {
      principal: scoped && principal
        ? { env: principal.env, userId: principal.userId, role: principal.role, organizationId, siteId }
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
      const { card_asset_id, card_kind, card_public_url, card_thumbnail_url, ...location } = l
      return {
        ...location,
        address,
        media: card_asset_id && card_public_url ? [{ asset_id: card_asset_id, slot: 'social_card' as const, public_url: card_public_url, thumbnail_url: card_thumbnail_url, kind: card_kind }] : [],
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
