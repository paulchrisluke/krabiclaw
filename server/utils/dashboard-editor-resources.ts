import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrganizationEntitlements } from '~/server/utils/billing-access'
import { listLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess, requireSiteAccess } from '~/server/utils/location-access'
import {
  assertLocationAccess,
  assertResourceAccess,
  assertSiteWideAccess,
  listAccessibleLocationIds,
} from '~/server/utils/member-access'
import { listSiteLocales } from '~/server/utils/site-locales'
import { getMediaAsset, listMediaAssets } from '~/server/utils/media-asset-manager'
import { getDashboardContext, getDashboardLocationContext } from '~/server/utils/dashboard-context'
import { loadSettingsPayload } from '~/server/utils/site-settings'
import { getNotificationsSettings } from '~/server/utils/mcp-workflows'
import { getFacebookPagesConnection } from '~/server/utils/facebook-pages'
import { resolveLocationCapabilitySummary } from '~/server/utils/location-management'
import { parseLocationPayload } from '~/server/utils/location-payload'
import { getProduct, hydrateProductMedia, listLocationProducts, summarizeLocationProducts } from '~/server/utils/product-management'
import { listDashboardGuestThreadsForPrincipal } from '~/server/utils/dashboard-guest-threads'
import { requireBlogAccess } from '~/server/utils/blog-access'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { getTenantPageById, listTenantPages } from '~/server/utils/content/pages'
import { getBlogPost, listBlogPosts } from '~/server/utils/content/publishing'
import { listPosts } from '~/server/utils/post-management'
import { createPreviewToken, PREVIEW_TOKEN_TTL_MS } from '~/server/utils/preview-token'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta } from '~/config/cms-registry'
import { getLocationReservationConfig } from '~/server/utils/reservations'

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

  const principal = {
    env,
    userId: site.user_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  }
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

export async function loadDashboardSiteLocales(event: H3Event, siteId: string) {
  const { db, site } = await requireSiteAccess(event, siteId)
  return { success: true as const, ...await listSiteLocales(db, site.organization_id, siteId) }
}

export async function loadDashboardLocationQa(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db } = await requireLocationAccess(event, siteId, locationId)
  return { qa: await listLocationQa(db, siteId, locationId) }
}

/**
 * The bookable products offered at one location.
 *
 * A booking config is what makes a product bookable, so this filters on that
 * relationship rather than on a discriminator column.
 */
export async function loadDashboardLocationBookableProducts(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const products = await listLocationProducts(db, { organizationId: site.organization_id, locationId })
  const bookable = await queryAll<{ product_id: string }>(db, `
    SELECT product_id FROM product_booking_configs WHERE organization_id = ?
  `, [site.organization_id])
  const bookableIds = new Set(bookable.map(row => row.product_id))
  return { products: products.filter(product => bookableIds.has(product.id)) }
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
  const principal = {
    env,
    userId: site.user_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  }
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

export async function loadDashboardSettingsResource(
  event: H3Event,
  options: { includeFacebook: boolean; organizationSlug?: string; siteSlug?: string },
) {
  const { env, db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: true,
    organizationSlug: options.organizationSlug,
    siteSlug: options.siteSlug,
  })
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  await assertSiteWideAccess(db, {
    env,
    userId,
    role: organization.role,
    organizationId: organization.id,
    siteId: site.id,
  })
  const [settings, notifications, facebookConnection] = await Promise.all([
    loadSettingsPayload(db, organization.id, site.id),
    getNotificationsSettings(db, organization.id, site.id),
    options.includeFacebook
      ? getFacebookPagesConnection(env, organization.id, site.id)
      : Promise.resolve(null),
  ])
  return {
    settings: { success: true as const, settings },
    notifications: { success: true as const, notifications },
    facebook: facebookConnection
      ? {
          connected: true as const,
          facebook_page_name: facebookConnection.facebook_page_name,
        }
      : { connected: false as const },
  }
}


export interface LocationContentCounts {
  photos: number
  posts: number
  qa: number
  upcomingReservations: number
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
      (SELECT COUNT(*) FROM content_documents WHERE kind = 'qa' AND row_role = 'root' AND site_id = ? AND location_id = ?) AS qa,
      -- Counted on the reservation, not the thread: the thread holds the
      -- conversation and the reservation holds the seating, including when it
      -- starts and whether it still stands.
      (SELECT COUNT(*) FROM reservations
        WHERE site_id = ? AND location_id = ? AND status IN ('pending', 'confirmed')
          AND starts_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS upcoming_reservations
  `, Array.from({ length: 4 }, () => [siteId, locationId]).flat())
  return {
    photos: row?.photos ?? 0,
    posts: row?.posts ?? 0,
    qa: row?.qa ?? 0,
    upcomingReservations: row?.upcoming_reservations ?? 0,
  }
}

export async function loadDashboardLocationOverview(
  event: H3Event,
  siteId: string,
  locationId: string,
  options: { includeProducts: boolean },
) {
  const { env, db, organization, location, userId } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  const principal = {
    env,
    userId,
    role: organization.role,
    organizationId: organization.id,
    siteId,
  }
  await assertLocationAccess(db, { ...principal, locationId })
  const [capabilities, catalog, threads, counts] = await Promise.all([
    resolveLocationCapabilitySummary(
      db,
      organization.id,
      siteId,
      location.feature_overrides as string | null ?? null,
    ),
    options.includeProducts
      ? summarizeLocationProducts(db, { organizationId: organization.id, locationId })
      : Promise.resolve({ total: 0, allExperiences: false }),
    // The principal is resolved and assertLocationAccess has just run for this
    // exact location. Handing the event over instead would re-read the session,
    // the site row and the member row, and assert the same thing again.
    listDashboardGuestThreadsForPrincipal(db, siteId, { principal, userId, query: { locationId } }),
    loadLocationContentCounts(db, siteId, locationId),
  ])
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
    catalog,
    threads: { summary: threads.summary },
    counts,
  }
}

export async function loadDashboardLocationSettings(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { env, db, organization, location, userId } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  await assertLocationAccess(db, {
    env,
    userId,
    role: organization.role,
    organizationId: organization.id,
    siteId,
    locationId,
  })
  const capabilities = await resolveLocationCapabilitySummary(
    db,
    organization.id,
    siteId,
    location.feature_overrides as string | null ?? null,
  )
  // The reservation policy is a row of its own, and the settings editor opens
  // its leaf from the same render — so it travels with the location rather than
  // costing a second round trip from the client.
  const reservationConfig = await getLocationReservationConfig(db, { organizationId: organization.id, locationId })
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
    reservationConfig: { success: true as const, config: reservationConfig },
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

/**
 * The Pages chain reads these on the server rather than calling its own
 * endpoints over HTTP during render, the way the Blog chain does. Rendering the
 * list and the open page server-side is what lets a section, a section's part
 * or a record inside one survive a direct load or a refresh: every level's
 * not-found guard reads the same loaded page, so a missing id answers 404 and a
 * real one answers itself.
 */
export async function loadDashboardTenantPages(event: H3Event, siteId: string, locale?: string | null) {
  const { db } = await requireTenantPageWriteAccess(event, siteId)
  return { pages: await listTenantPages(db, siteId, { locale: locale ?? null }) }
}

export async function loadDashboardTenantPage(event: H3Event, siteId: string, variantId: string) {
  const { db, site } = await requireTenantPageWriteAccess(event, siteId)
  const page = await getTenantPageById(db, variantId, { siteId, organizationId: site.organization_id })
  if (!page) throw new HTTPError({ statusCode: 404, statusMessage: 'Page not found' })
  return { page }
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

// Loads the location-owned Product collection directly for the editor's SSR render.
export async function loadDashboardLocationProducts(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const products = await listLocationProducts(db, { organizationId: site.organization_id, locationId })
  return { success: true as const, products }
}

export async function loadDashboardLocationPosts(
  event: H3Event,
  siteId: string,
  locationId: string,
  status?: string,
) {
  const { env, db, site } = await requireLocationAccess(event, siteId, locationId)
  const [posts, connection] = await Promise.all([
    listPosts(db, site.organization_id, siteId, status, locationId),
    getFacebookPagesConnection(env, site.organization_id, siteId),
  ])
  return {
    posts: { success: true as const, posts },
    facebook: { connected: Boolean(connection) },
  }
}
