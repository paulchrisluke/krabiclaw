import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertDashboardPathPermission, assertMemberSiteAccess, isOrganizationWideRole } from '~/server/utils/member-access'

export interface DashboardOrganizationRow {
  id: string
  name: string
  slug: string | null
  logo: string | null
  role: string
  memberId: string
}

export interface DashboardSiteRow {
  id: string
  organization_id: string
  brand_name: string | null
  // Raw sites.vertical storage value (see sites_vertical_check in
  // server/db/schema.ts): one of restaurant, experience, retail, wellness,
  // or service — where service is professional_service's DB-storage alias
  // (see server/utils/site-creation.ts's toStoredVertical /
  // utils/vertical-copy.ts's normalizeVertical). A narrower literal union
  // here previously caused callers (transfer onboarding) to silently coerce
  // any non-'experience' vertical to 'restaurant' — consumers that need the
  // canonical app-level value must call normalizeVertical() on this field
  // rather than relying on TypeScript to have already narrowed it.
  vertical: string | null
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
  // Opt-in only — see resolveRecentlyTransferredSite. Defaults to off so generic
  // multi-site callers (e.g. the org-root single-site auto-redirect) keep returning
  // null on ambiguity rather than being silently steered toward a transferred site.
  allowTransferFallback?: boolean
  // Defaults to true (throw if the user has no organization at all). Signup no
  // longer auto-creates a personal org (see auth.ts), so a brand-new user
  // legitimately has zero organizations until they create or join one — only
  // the onboarding discovery endpoint (/api/dashboard/context) opts out of the
  // throw to represent that state instead of erroring.
  requireOrganization?: boolean
}

async function resolveSingleOrgSite(db: DbClient, organizationId: string): Promise<DashboardSiteRow | null> {
  const sites = await queryAll<DashboardSiteRow>(db, `
    SELECT id, organization_id, brand_name, vertical, subdomain, custom_domain, public_url,
           status, onboarding_status, plan, primary_location_id, default_currency, source_locale
    FROM sites
    WHERE organization_id = ?
    LIMIT 2
  `, [organizationId])
  return sites.length === 1 ? sites[0]! : null
}

// Not a guess: the org-scoped /~/onboarding route has no siteSlug to attach a header
// from, and a recipient who already owned a site before accepting a handoff legitimately
// ends up with 2+ sites. The site this route means is unambiguous — whichever site this
// exact user most recently accepted a transfer into — so resolve it precisely instead of
// falling back to null the way genuine multi-site ambiguity does.
async function resolveRecentlyTransferredSite(db: DbClient, organizationId: string, userId: string): Promise<DashboardSiteRow | null> {
  return await queryFirst<DashboardSiteRow>(db, `
    SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, s.custom_domain, s.public_url,
           s.status, s.onboarding_status, s.plan, s.primary_location_id, s.default_currency, s.source_locale
    FROM site_transfer_requests t
    JOIN sites s ON s.id = t.site_id
    WHERE t.claiming_organization_id = ? AND t.accepted_by_user_id = ? AND t.status = 'accepted'
    ORDER BY t.completed_at DESC
    LIMIT 1
  `, [organizationId, userId])
}

export async function getDashboardContext(
  _event: H3Event,
  _options: DashboardContextOptions & { requireOrganization: false }
): Promise<{
  env: ReturnType<typeof cloudflareEnv>
  db: D1Database
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  userId: string
  organization: DashboardOrganizationRow | null
  site: DashboardSiteRow | null
}>
export async function getDashboardContext(
  _event: H3Event,
  _options?: DashboardContextOptions
): Promise<{
  env: ReturnType<typeof cloudflareEnv>
  db: D1Database
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  userId: string
  organization: DashboardOrganizationRow
  site: DashboardSiteRow | null
}>
export async function getDashboardContext(event: H3Event, options: DashboardContextOptions = {}): Promise<{
  env: ReturnType<typeof cloudflareEnv>
  db: D1Database
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  userId: string
  organization: DashboardOrganizationRow | null
  site: DashboardSiteRow | null
}> {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    throw createError({ statusCode: 503, message: 'Database not available' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const organizationSlug = getHeader(event, 'x-dashboard-org-slug')
  if (!organizationSlug && options.requireOrganization !== false) {
    throw createError({
      statusCode: 400,
      message: 'Organization slug is required. Use /dashboard/{orgSlug} routes.',
    })
  }

  const organization = organizationSlug
    ? await queryFirst<DashboardOrganizationRow>(db, `
    SELECT o.id, o.name, o.slug, o.logo, m.role, m.id AS memberId
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
      AND o.slug = ?
    LIMIT 1
  `, [session.user.id, organizationSlug])
    : null

  if (!organization) {
    if (options.requireOrganization === false) {
      return {
        env,
        db,
        session,
        userId: session.user.id,
        organization: null,
        site: null,
      }
    }
    throw createError({ statusCode: 404, message: 'Organization not found' })
  }
  assertDashboardPathPermission(organization.role, event.path)

  // The organization and active site are resolved explicitly from the route segments,
  // sent on every /api/dashboard/* request via dashboard headers (see
  // plugins/dashboard-site-header.client.ts). All dashboard routes must include the site
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

  // With no slug, auto-select only when the org has exactly one site — the same
  // single-site auto-redirect the `/dashboard/{orgSlug}` org-root route documents.
  // With 2+ sites we still return null rather than guess, since guessing is the
  // exact silent-wrong-site risk 3d7827b removed this fallback to prevent.
  const site = siteSlug
    ? await queryFirst<DashboardSiteRow>(db, `
        SELECT id, organization_id, brand_name, vertical, subdomain, custom_domain, public_url,
               status, onboarding_status, plan, primary_location_id, default_currency, source_locale
        FROM sites
        WHERE organization_id = ? AND subdomain = ?
        LIMIT 1
      `, [organization.id, siteSlug])
    : await resolveSingleOrgSite(db, organization.id)
      ?? (options.allowTransferFallback ? await resolveRecentlyTransferredSite(db, organization.id, session.user.id) : null)

  if (!site && options.requireSite !== false) {
    throw createError({ statusCode: 404, message: 'Site not found' })
  }

  if (site) {
    await assertMemberSiteAccess(db, {
      memberId: organization.memberId,
      role: organization.role,
      organizationId: organization.id,
      siteId: site.id,
    })
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

export async function listOrganizationSites(db: DbClient, organizationId: string, principal?: { memberId: string; role: string }) {
  return await queryAll<DashboardSiteSummaryRow>(db, `
    SELECT id, brand_name, subdomain, plan
    FROM sites
    WHERE organization_id = ?
      ${principal && !isOrganizationWideRole(principal.role) ? 'AND EXISTS (SELECT 1 FROM member_access_scope mas WHERE mas.member_id = ? AND mas.organization_id = sites.organization_id AND mas.site_id = sites.id)' : ''}
    ORDER BY created_at ASC, id ASC
  `, principal && !isOrganizationWideRole(principal.role) ? [organizationId, principal.memberId] : [organizationId])
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

export async function listDashboardLocations(db: DbClient, organizationId: string, siteId: string, principal?: { memberId: string; role: string }) {
  const locations = await queryAll<DashboardLocationRow>(db, `
    SELECT id, slug, title, is_primary, status
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
      ${principal && !isOrganizationWideRole(principal.role) ? 'AND EXISTS (SELECT 1 FROM member_access_scope mas WHERE mas.member_id = ? AND mas.organization_id = business_locations.organization_id AND mas.site_id = business_locations.site_id AND (mas.location_id IS NULL OR mas.location_id = business_locations.id))' : ''}
    ORDER BY is_primary DESC, title ASC
  `, principal && !isOrganizationWideRole(principal.role) ? [organizationId, siteId, principal.memberId] : [organizationId, siteId])

  return locations.map((location) => ({
    ...location,
    is_primary: Boolean(location.is_primary)
  }))
}

export async function resolveSelectedDashboardLocation(
  db: DbClient,
  userId: string,
  organizationId: string,
  siteId: string,
  principal?: { memberId: string; role: string }
) {
  const locations = await listDashboardLocations(db, organizationId, siteId, principal)
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
