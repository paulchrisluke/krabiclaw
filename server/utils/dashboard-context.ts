import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'

export interface DashboardOrganizationRow {
  id: string
  name: string
  slug: string | null
  logo: string | null
  role: string
}

export interface DashboardSiteRow {
  id: string
  organization_id: string
  brand_name: string | null
  vertical: 'restaurant' | 'experience' | null
  subdomain: string | null
  custom_domain: string | null
  public_url: string | null
  status: string
  onboarding_status: string
  plan: string | null
  primary_location_id: string | null
  default_currency: string | null
  source_locale: string | null
  heroImageUrl?: string | null
  locationHeroImageUrl?: string | null
}

export interface DashboardLocationRow {
  id: string
  slug: string
  title: string
  is_primary: number | boolean
  status: string
}

interface DashboardPreferenceRow {
  selected_location_id: string | null
}

interface DashboardContextOptions {
  requireSite?: boolean
}

export async function getDashboardContext(event: H3Event, options: DashboardContextOptions = {}) {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    throw createError({ statusCode: 503, message: 'Database not available' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
  const activeOrganizationId = typeof sessionRecord.activeOrganizationId === 'string'
    ? sessionRecord.activeOrganizationId
    : null

  const organization = await queryFirst<DashboardOrganizationRow>(db, `
    SELECT o.id, o.name, o.slug, o.logo, m.role
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC
    LIMIT 1
  `, [session.user.id, activeOrganizationId ?? ''])

  if (!organization) {
    throw createError({ statusCode: 404, message: 'No organization found' })
  }

  // The active site is resolved explicitly from the `siteSlug` route segment, sent on
  // every /api/dashboard/* request via the x-dashboard-site-slug header (see
  // plugins/dashboard-site-header.ts). All dashboard routes must include the site
  // explicitly in the URL path for multi-site support. Callers that pass
  // `requireSite: false` (onboarding, org-level routes, and this function's own
  // discovery endpoint /api/dashboard/context) are explicitly designed to work
  // before a site is known/selected, so a missing header there means "no site
  // selected yet" rather than a client error — only callers that need a site
  // get the hard 400.
  const siteSlug = getHeader(event, 'x-dashboard-site-slug')

  if (!siteSlug && options.requireSite !== false) {
    throw createError({ statusCode: 400, message: 'Site slug is required. Use /dashboard/{orgSlug}/sites/{siteSlug} routes.' })
  }

  const site = siteSlug
    ? await queryFirst<DashboardSiteRow>(db, `
        SELECT id, organization_id, brand_name, vertical, subdomain, custom_domain, public_url,
               status, onboarding_status, plan, primary_location_id, default_currency, source_locale
        FROM sites
        WHERE organization_id = ? AND subdomain = ?
        LIMIT 1
      `, [organization.id, siteSlug])
    : null

  if (!site && options.requireSite !== false) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }

  const siteConfig = site
    ? await queryAll<{ key: string; value: string | null }>(db, `
        SELECT key, value
        FROM site_config
        WHERE organization_id = ? AND site_id = ?
          AND key IN ('hero_image_url', 'location_hero_image_url')
      `, [organization.id, site.id])
    : []

  const configByKey = Object.fromEntries(siteConfig.map((row) => [row.key, row.value]))

  return {
    env,
    db,
    session,
    userId: session.user.id,
    organization,
    site: site ? {
      ...site,
      heroImageUrl: configByKey.hero_image_url ?? null,
      locationHeroImageUrl: configByKey.location_hero_image_url ?? null,
    } : null
  }
}

export interface DashboardSiteSummaryRow {
  id: string
  brand_name: string | null
  subdomain: string | null
  plan: string | null
}

export async function listOrganizationSites(db: DbClient, organizationId: string) {
  return await queryAll<DashboardSiteSummaryRow>(db, `
    SELECT id, brand_name, subdomain, plan
    FROM sites
    WHERE organization_id = ?
    ORDER BY created_at ASC
  `, [organizationId])
}

export async function getDashboardSite(event: H3Event) {
  const context = await getDashboardContext(event, { requireSite: true })
  if (!context.site) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }
  return {
    ...context,
    site: context.site
  }
}

export async function listDashboardLocations(db: DbClient, organizationId: string, siteId: string) {
  const locations = await queryAll<DashboardLocationRow>(db, `
    SELECT id, slug, title, is_primary, status
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    ORDER BY is_primary DESC, title ASC
  `, [organizationId, siteId])

  return locations.map((location) => ({
    ...location,
    is_primary: Boolean(location.is_primary)
  }))
}

export async function resolveSelectedDashboardLocation(
  db: DbClient,
  userId: string,
  organizationId: string,
  siteId: string
) {
  const locations = await listDashboardLocations(db, organizationId, siteId)
  const preference = await queryFirst<DashboardPreferenceRow>(db, `
    SELECT selected_location_id
    FROM dashboard_preferences
    WHERE user_id = ? AND organization_id = ?
    LIMIT 1
  `, [userId, organizationId])

  const selectedLocation = locations.find((location) => location.id === preference?.selected_location_id)
    ?? locations.find((location) => location.is_primary)
    ?? locations[0]
    ?? null

  return {
    locations,
    selectedLocation
  }
}
