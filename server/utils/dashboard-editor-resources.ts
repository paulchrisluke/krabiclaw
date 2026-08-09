import type { H3Event } from 'h3'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
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
import { getMenus, getMenuWithItems } from '~/server/utils/menu-management'
import { loadDashboardGuestThreads } from '~/server/utils/dashboard-guest-threads'
import { requireBlogAccess } from '~/server/utils/blog-access'
import { getPlatformBlogPost, listPlatformBlogPosts } from '~/server/utils/platform-content'
import { listPosts } from '~/server/utils/post-management'
import { createPreviewToken } from '~/server/utils/preview-token'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta } from '~/config/cms-registry'

interface EditorSiteRow {
  id: string
  brand_name: string
  subdomain: string
  organization_id: string
  status: string
  onboarding_status: string
  organization_name: string
  vertical: string
  theme_id: string
  feature_overrides: string | null
  member_id: string
  member_role: string
}

interface EditorLocationRow {
  id: string
  slug: string
  title: string
  is_primary: number | boolean
  status: 'active' | 'inactive' | 'sync_error'
  feature_overrides: string | null
}

export async function loadDashboardEditorContext(event: H3Event, siteId: string) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const site = await queryFirst<EditorSiteRow>(db, `
    SELECT s.id, s.brand_name, s.subdomain, s.organization_id, s.status, s.onboarding_status,
           s.vertical, s.theme_id, s.feature_overrides, o.name AS organization_name,
           om.id AS member_id, om.role AS member_role
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
     WHERE s.id = ? AND om.userId = ?
     LIMIT 1
  `, [siteId, session.user.id])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })

  const principal = {
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
    throw createError({ statusCode: 500, statusMessage: 'PREVIEW_SECRET is required for editor previews' })
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
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const site = await queryFirst<{
    id: string
    organization_id: string
    member_id: string
    member_role: string
  }>(db, `
    SELECT s.id, s.organization_id, om.id AS member_id, om.role AS member_role
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
     WHERE s.id = ? AND om.userId = ?
     LIMIT 1
  `, [siteId, session.user.id])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  await assertSiteWideAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })
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
  locationId?: string
  search?: string
  limit?: number
  offset?: number
}

export async function loadDashboardMedia(
  event: H3Event,
  siteId: string,
  filters: DashboardMediaFilters = {},
) {
  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const principal = {
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
        resourceLocationId: asset.location_id ?? null,
      })
    }
    return { media: asset ? [asset] : [] }
  }

  await assertResourceAccess(db, {
    ...principal,
    resourceLocationId: filters.locationId ?? null,
  })
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)
  return {
    media: await listMediaAssets(db, siteId, {
      kind: filters.kind,
      locationId: filters.locationId,
      search: filters.search,
      limit,
      offset,
    }),
  }
}

export async function loadDashboardSettingsResource(
  event: H3Event,
  options: { includeFacebook: boolean },
) {
  const { env, db, organization, site } = await getDashboardContext(event, { requireSite: true })
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  await assertSiteWideAccess(db, {
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
          facebook_page_name: facebookConnection.facebook_page_name ?? undefined,
        }
      : { connected: false as const },
  }
}

export async function loadDashboardLocationOverview(
  event: H3Event,
  siteId: string,
  locationId: string,
  options: { includeMenus: boolean },
) {
  const { db, organization, location } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  await assertLocationAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId,
    locationId,
  })
  const [capabilities, menus, threads] = await Promise.all([
    resolveLocationCapabilitySummary(
      db,
      organization.id,
      siteId,
      location.feature_overrides as string | null ?? null,
    ),
    options.includeMenus
      ? getMenus(db, organization.id, siteId, locationId)
      : Promise.resolve([]),
    loadDashboardGuestThreads(event, siteId, { locationId }),
  ])
  return {
    location: {
      success: true as const,
      location: parseLocationPayload(location)!,
      ...capabilities,
    },
    menus: { success: true as const, menus },
    threads: { summary: threads.summary },
  }
}

export async function loadDashboardLocationSettings(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db, organization, location } = await getDashboardLocationContext(event, locationId)
  if (location.site_id !== siteId) {
    throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  }
  await assertLocationAccess(db, {
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
  const { db } = await requireBlogAccess(event, siteId)
  return { posts: await listPlatformBlogPosts(db, status, siteId) }
}

export async function loadDashboardBlogPost(
  event: H3Event,
  siteId: string,
  postId: string,
) {
  const { db } = await requireBlogAccess(event, siteId)
  const post = await getPlatformBlogPost(db, postId, siteId)
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return { post }
}

export async function loadDashboardMenu(
  event: H3Event,
  siteId: string,
  menuId: string,
) {
  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const menu = await getMenuWithItems(db, site.organization_id, siteId, menuId)
  if (!menu) throw createError({ statusCode: 404, statusMessage: 'Menu not found' })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: menu.location_id ?? null,
  })
  return { success: true as const, menu }
}

// Mirrors GET /api/editor/sites/[siteId]/menus?locationId=... (menus.get.ts) —
// list menus for a location, plus the first menu's own items so the editor's
// initial SSR render has real menu data instead of a client-only fetch.
export async function loadDashboardLocationMenus(
  event: H3Event,
  siteId: string,
  locationId: string,
) {
  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const menus = await getMenus(db, site.organization_id, siteId, locationId)
  const menu = menus.length > 0
    ? await getMenuWithItems(db, site.organization_id, siteId, menus[0]!.id)
    : null
  return { success: true as const, menus, menu }
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
