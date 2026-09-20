import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { listAccessibleLocationIds, type MemberAccessPrincipal } from '~/server/utils/member-access'
import { calculateMapEmbedUrl } from '~/server/utils/google-places'
import { listTenantPages } from '~/server/utils/content/pages'
import { parsePostalAddress } from '~/utils/postal-address'

export interface DashboardHomeLocation {
  id: string
  slug: string
  title: string
  rating: number | null
  review_count: number | null
  status: string
  updated_at: string
  address: PostalAddress | null
  latitude: number | null
  longitude: number | null
  map_embed_url: string | null
  media: Array<{ asset_id: string; slot: 'social_card'; public_url: string; thumbnail_url: string | null; kind: string | null }>
}

export interface DashboardHomeData {
  locations: DashboardHomeLocation[]
  pages: Awaited<ReturnType<typeof listTenantPages>>
  /** What the site-wide cards state: published articles, site questions, site reviews. */
  counts: { blog: number; qa: number; reviews: number }
}

/** The site hub's payload: its locations, its pages and the counts its cards state. */
export async function getDashboardHomeData(
  db: DbClient,
  organizationId: string,
  siteId: string,
  principal: MemberAccessPrincipal,
): Promise<DashboardHomeData> {
  const accessibleLocationIds = await listAccessibleLocationIds(db, principal)
  const scoped = accessibleLocationIds !== null
  const locationScopeClause = scoped
    ? accessibleLocationIds.length > 0 ? `AND bl.id IN (SELECT value FROM json_each(?))` : 'AND 0'
    : ''
  const scopedParams = accessibleLocationIds?.length ? [d1JsonStringSet(accessibleLocationIds)] : []
  const [locations, pages, counts] = await Promise.all([
    queryAll<{
      id: string; slug: string; title: string
      rating: number | null; review_count: number | null
      status: string; updated_at: string
      address: string | null; maps_url: string | null
      latitude: number | null; longitude: number | null
      card_asset_id: string | null; card_kind: string | null; card_public_url: string | null
      card_thumbnail_url: string | null
    }>(db, `
      SELECT bl.id, bl.slug, bl.title, bl.rating, bl.review_count,
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
    listTenantPages(db, siteId),
    // Positional placeholders repeated per subquery: D1 binds each `?` in order.
    queryFirst<{ blog: number; qa: number; reviews: number }>(db, `
      SELECT
        (SELECT COUNT(*) FROM content_documents WHERE kind = 'article' AND row_role = 'root' AND site_id = ? AND status = 'published') AS blog,
        (SELECT COUNT(*) FROM content_documents WHERE kind = 'qa' AND row_role = 'root' AND site_id = ? AND location_id IS NULL) AS qa,
        (SELECT COUNT(*) FROM reviews WHERE site_id = ? AND location_id IS NULL) AS reviews
    `, [siteId, siteId, siteId]),
  ])

  return {
    locations: locations.map((l) => {
      const address = parsePostalAddress(l.address)
      const { card_asset_id, card_kind, card_public_url, card_thumbnail_url, ...location } = l
      return {
        ...location,
        address,
        media: card_asset_id && card_public_url ? [{ asset_id: card_asset_id, slot: 'social_card' as const, public_url: card_public_url, thumbnail_url: card_thumbnail_url, kind: card_kind }] : [],
        map_embed_url: calculateMapEmbedUrl({ ...l, address }),
      }
    }),
    pages,
    counts: { blog: counts?.blog ?? 0, qa: counts?.qa ?? 0, reviews: counts?.reviews ?? 0 },
  }
}
