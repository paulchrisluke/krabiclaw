import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll } from '~/server/db'
import { listLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess, requireSiteAccess } from '~/server/utils/location-access'
import { listExperiences } from '~/server/utils/experiences'
import {
  assertLocationAccess,
  assertResourceAccess,
  assertSiteContextAccess,
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
import { getProduct, listLocationProducts } from '~/server/utils/product-management'
import { loadDashboardGuestThreads } from '~/server/utils/dashboard-guest-threads'
import { requireBlogAccess } from '~/server/utils/blog-access'
import { getPlatformBlogPost, listPlatformBlogPosts } from '~/server/utils/platform-content'
import { listPosts } from '~/server/utils/post-management'
import { createPreviewToken } from '~/server/utils/preview-token'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta } from '~/config/cms-registry'

interface EditorLocationRow {
  id: string
  slug: string
  title: string
  is_primary: number | boolean
  status: 'active' | 'inactive' | 'sync_error'
  feature_overrides: string | null
}

export async function loadDashboardEditorContext(event: H3Event, siteId: string) {
  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  if (!site.vertical) throw new HTTPError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

  const principal = {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  }
  await assertSiteContextAccess(db, principal)
  const accessibleLocationIds = await listAccessibleLocationIds(db, principal)
  const [locationRows, entitlementRows] = await Promise.all([
    queryAll<EditorLocationRow>(db, `
      SELECT id, slug, title, is_primary, status, feature_overrides
        FROM business_locations
       WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ORDER BY is_primary DESC, title ASC
    `, [site.organization_id, siteId]),
    queryAll<{ key: string; value: string }>(db, 'SELECT key, value FROM site_entitlements WHERE site_id = ?', [siteId]),
  ])
  const locations = locationRows
    .filter(location => accessibleLocationIds === null || accessibleLocationIds.includes(location.id))
    .map(location => ({ ...location, is_primary: Boolean(location.is_primary) }))
  const entitlements = entitlementRows.reduce<Record<string, string | boolean>>((result, row) => {
    result[row.key] = row.value === 'true' ? true : row.value === 'false' ? false : row.value
    return result
  }, {})
  if (typeof env.PREVIEW_SECRET !== 'string' || !env.PREVIEW_SECRET) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'PREVIEW_SECRET is required for editor previews' })
  }
  const previewToken = await createPreviewToken(env.PREVIEW_SECRET, siteId, Date.now() + 60 * 60 * 1000)
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

export async function loadDashboardLocationExperiences(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db } = await requireLocationAccess(event, siteId, locationId)
  return { experiences: await listExperiences(db, siteId, { locationId }) }
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
    memberId: site.member_id,
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
  const { env, db, organization, site } = await getDashboardContext(event, {
    requireSite: true,
    organizationSlug: options.organizationSlug,
    siteSlug: options.siteSlug,
  })
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  await assertSiteWideAccess(db, {
    env,
    memberId: organization.memberId,
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
  await assertLocationAccess(db, {
    env,
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId,
    locationId,
  })
  const [capabilities, products, threads] = await Promise.all([
    resolveLocationCapabilitySummary(
      db,
      organization.id,
      siteId,
      location.feature_overrides as string | null ?? null,
    ),
    options.includeProducts
      ? listLocationProducts(db, organization.id, siteId, locationId)
      : Promise.resolve([]),
    loadDashboardGuestThreads(event, siteId, { locationId }),
  ])
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
    products: { success: true as const, products },
    threads: { summary: threads.summary },
  }
}

export async function loadDashboardLocationSettings(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { env, db, organization, location } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  await assertLocationAccess(db, {
    env,
    memberId: organization.memberId,
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
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
  }
}

export async function loadDashboardBlogPosts(
  event: H3Event,
  siteId: string,
  status?: string,
) {
  const { env, db } = await requireBlogAccess(event, siteId)
  return { posts: await listPlatformBlogPosts(db, status, siteId, env) }
}

export async function loadDashboardBlogPost(
  event: H3Event,
  siteId: string,
  postId: string,
) {
  const { env, db } = await requireBlogAccess(event, siteId)
  const post = await getPlatformBlogPost(db, postId, siteId, env)
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
  const product = await getProduct(db, site.organization_id, siteId, locationId, productId)
  if (!product) throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found' })
  return { success: true as const, product }
}

// Loads the location-owned Product collection directly for the editor's SSR render.
export async function loadDashboardLocationProducts(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const products = await listLocationProducts(db, site.organization_id, siteId, locationId)
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
    listPosts(db, site.organization_id, siteId, env, status, locationId),
    getFacebookPagesConnection(env, site.organization_id, siteId),
  ])
  return {
    posts: { success: true as const, posts },
    facebook: { connected: Boolean(connection) },
  }
}
