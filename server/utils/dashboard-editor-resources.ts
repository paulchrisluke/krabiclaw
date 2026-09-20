import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrganizationEntitlements } from '~/server/utils/billing-access'
import { listLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess, requireSiteAccess } from '~/server/utils/location-access'
import {
  assertLocationAccess,
  assertResourceAccess,
  listAccessibleLocationIds,
  memberAccessPrincipal,
} from '~/server/utils/member-access'
import { getMediaAsset, listMediaAssets } from '~/server/utils/media-asset-manager'
import { getDashboardLocationContext } from '~/server/utils/dashboard-context'
import { resolveLocationCapabilitySummary } from '~/server/utils/location-management'
import { parseLocationPayload } from '~/server/utils/location-payload'
import { getProduct, hydrateProductMedia, summarizeLocationProducts } from '~/server/utils/product-management'
import { getLocationReservationConfig } from '~/server/utils/reservations'
import { requireBlogAccess } from '~/server/utils/blog-access'
import { getBlogPost, listBlogPosts } from '~/server/utils/content/publishing'
import { createPreviewToken, PREVIEW_TOKEN_TTL_MS } from '~/server/utils/preview-token'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta } from '~/config/cms-registry'

interface EditorLocationRow {
  id: string
  slug: string
  title: string
  status: 'active' | 'inactive' | 'sync_error'
  feature_overrides: string | null
}

export async function loadDashboardEditorContext(event: H3Event, siteId: string) {
  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  if (!site.vertical) throw new HTTPError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

  const principal = memberAccessPrincipal(site.membership, { env, siteId, event })
  // requireSiteAccess(event, siteId, 'context') has already run
  // assertSiteContextAccess with this exact principal (location-access.ts), so
  // asserting it again here only bought a second read of the same member row.
  const accessibleLocationIds = await listAccessibleLocationIds(db, principal)
  const [locationRows, entitlements] = await Promise.all([
    queryAll<EditorLocationRow>(db, `
      SELECT id, slug, title, status, feature_overrides
        FROM business_locations
       WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ORDER BY title ASC
    `, [site.organization_id, siteId]),
    getOrganizationEntitlements(env, site.organization_id),
  ])
  const locations = locationRows
    .filter(location => accessibleLocationIds === null || accessibleLocationIds.includes(location.id))
  if (typeof env.PREVIEW_SECRET !== 'string' || !env.PREVIEW_SECRET) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'PREVIEW_SECRET is required for editor previews' })
  }
  const previewToken = await createPreviewToken(env.PREVIEW_SECRET, siteId, Date.now() + PREVIEW_TOKEN_TTL_MS)
  const { vertical, template } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
    siteEnabledFeatures: site.feature_overrides,
  })
  return {
    success: true as const,
    context: {
      site: {
        id: site.id,
        brand_name: site.brand_name,
        subdomain: site.subdomain,
        status: site.status,
        onboarding_status: site.onboarding_status,
        vertical,
        template,
        feature_overrides: site.feature_overrides,
        entitlements,
      },
      organization: { id: site.organization_id, name: site.organization_name },
      locations,
      scopes: [
        ...(accessibleLocationIds === null ? [{ id: null, label: 'Brand-wide', type: 'brand' as const }] : []),
        ...locations.map(location => ({ id: location.id, label: location.title, type: 'location' as const })),
      ],
      previewToken,
      editablePages: getEditablePages(vertical, template, {
        site: parseCmsFeatureOverrideDelta(site.feature_overrides),
      }),
    },
  }
}

export async function loadDashboardLocationQa(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db } = await requireLocationAccess(event, siteId, locationId)
  return { qa: await listLocationQa(db, siteId, locationId) }
}

export interface DashboardMediaFilters {
  id?: string
  kind?: string
  ownerType?: string
  ownerId?: string
  slot?: string
  search?: string
  limit?: number
  offset?: number
}

export async function loadDashboardMedia(
  event: H3Event,
  siteId: string,
  filters: DashboardMediaFilters = {},
) {
  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  const principal = memberAccessPrincipal(site.membership, { env, siteId, event })
  if (filters.id) {
    const asset = await getMediaAsset(db, filters.id, siteId)
    if (asset) {
      await assertResourceAccess(db, {
        ...principal,
        resourceLocationId: null,
      })
    }
    return { media: asset ? [asset] : [] }
  }

  await assertResourceAccess(db, {
    ...principal,
    resourceLocationId: null,
  })
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  return {
    media: await listMediaAssets(db, siteId, {
      kind: filters.kind,
      ownerType: filters.ownerType,
      ownerId: filters.ownerId,
      slot: filters.slot,
      search: filters.search,
      limit,
      offset,
    }),
  }
}

export interface LocationContentCounts {
  photos: number
  posts: number
  qa: number
}

/**
 * What each row on the location hub reports about itself.
 *
 * One statement rather than five round trips, because the hub renders every
 * count at once and a row with no number is a row nobody can act on without
 * opening it first.
 */
async function loadLocationContentCounts(
  db: DbClient,
  siteId: string,
  locationId: string,
): Promise<LocationContentCounts> {
  // Positional placeholders repeated per subquery: D1 binds each `?` in order
  // and does not honour numbered `?1` parameters, which silently returned zero
  // for every count after the first.
  const row = await queryFirst<Record<string, number>>(db, `
    SELECT
      -- Joined to the asset: a placement can stay active while its asset is
      -- retired, and every other media read here requires an active asset. The
      -- count has to mean photos a guest could actually see.
      (SELECT COUNT(*) FROM media_placements mp
        JOIN media_assets ma ON ma.id = mp.asset_id
         AND ma.organization_id = mp.organization_id AND ma.site_id = mp.site_id
         AND ma.status = 'active'
        WHERE mp.site_id = ? AND mp.owner_type = 'business_location' AND mp.owner_id = ?
          AND mp.slot IN ('hero', 'gallery') AND mp.status = 'active') AS photos,
      (SELECT COUNT(*) FROM content_documents WHERE kind = 'social_post' AND row_role = 'root' AND site_id = ? AND location_id = ? AND status = 'published') AS posts,
      (SELECT COUNT(*) FROM content_documents WHERE kind = 'qa' AND row_role = 'root' AND site_id = ? AND location_id = ?) AS qa
  `, Array.from({ length: 3 }, () => [siteId, locationId]).flat())
  return {
    photos: row?.photos ?? 0,
    posts: row?.posts ?? 0,
    qa: row?.qa ?? 0,
  }
}

export async function loadDashboardLocationOverview(
  event: H3Event,
  siteId: string,
  locationId: string,
  options: { includeProducts: boolean },
) {
  const { env, db, organization, location } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  const principal = memberAccessPrincipal(organization, { env, siteId, event })
  await assertLocationAccess(db, { ...principal, locationId })
  const [capabilities, catalog, reservationConfig, counts] = await Promise.all([
    resolveLocationCapabilitySummary(
      db,
      organization.id,
      siteId,
      location.feature_overrides as string | null ?? null,
    ),
    options.includeProducts
      ? summarizeLocationProducts(db, { organizationId: organization.id, locationId })
      : Promise.resolve({ total: 0, experiences: 0 }),
    getLocationReservationConfig(db, { organizationId: organization.id, locationId }),
    loadLocationContentCounts(db, siteId, locationId),
  ])
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
    catalog,
    reservationConfig,
    counts,
  }
}

export async function loadDashboardBlogPosts(
  event: H3Event,
  siteId: string,
  status?: string,
) {
  const { env, db } = await requireBlogAccess(event, siteId)
  return { posts: await listBlogPosts(db, siteId, status, env) }
}

export async function loadDashboardBlogPost(
  event: H3Event,
  siteId: string,
  postId: string,
) {
  const { env, db } = await requireBlogAccess(event, siteId)
  const post = await getBlogPost(db, postId, siteId, env)
  if (!post) throw new HTTPError({ statusCode: 404, statusMessage: 'Post not found' })
  return { post }
}

export async function loadDashboardProduct(
  event: H3Event,
  siteId: string,
  locationId: string,
  productId: string,
) {
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const product = await getProduct(db, site.organization_id, productId)
  // The catalog is organization-owned, so being offered here is what makes
  // this location's editor the right place to open it.
  if (!product.locations.some(entry => entry.location_id === locationId)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found at this location' })
  }
  // Media placements are site-scoped, and the editor shows the photograph the
  // public page shows — the same hydration the location list does, so opening
  // one product and listing them cannot disagree about its cover.
  const [hydrated] = await hydrateProductMedia(db, siteId, [product])
  return { success: true as const, product: hydrated! }
}

