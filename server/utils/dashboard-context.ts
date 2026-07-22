import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertDashboardPathPermission, assertMemberSiteAccess, isOrganizationWideRole } from '~/server/utils/member-access'

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// business_locations.address is written exclusively as { addressLines: string[] }
// (see normalizeAddressLines in location-management.ts) — this guards against
// malformed/legacy rows that predate that normalization rather than trusting an
// unchecked cast, which would otherwise silently hand callers a shape that
// doesn't match what they expect from the address contract.
function parseLocationAddress(value: string | null): { addressLines: string[] } | null {
  if (!value) return null
  const parsed = safeJsonParse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const addressLines = (parsed as Record<string, unknown>).addressLines
  if (!Array.isArray(addressLines) || !addressLines.every(line => typeof line === 'string')) return null
  return { addressLines }
}

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
  city: string | null
  address: string | null
  hero_url: string | null
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

export interface ResolveOrganizationOptions {
  // From an explicit caller-supplied param (e.g. billing's body/query organizationId).
  // Still membership-checked — never trusted outright.
  explicitOrganizationId?: string | null
  // The Better Auth session's session.activeOrganizationId, if the caller wants it
  // considered at all. Pass null/undefined to make this resolution strictly
  // header/explicit-param-only (the required behavior for billing and any other
  // URL-scoped route — a stale session-wide active org must never silently stand
  // in for the org actually named in the request).
  activeOrganizationId?: string | null
}

// The one place "which org is this request for" gets decided. Both explicit params
// and the x-dashboard-org-slug header are membership-checked before being trusted;
// if both are present and disagree, that's a client bug (stale cached org id vs.
// current URL) and must fail loudly rather than silently pick one. activeOrganizationId
// is the last resort and only consulted when the caller explicitly passes it in —
// callers that have URL context (any /dashboard/{orgSlug}/... or billing/integration
// route reachable from one) must never pass it.
export async function resolveRequestedOrganization(
  event: H3Event,
  db: DbClient,
  userId: string,
  options: ResolveOrganizationOptions = {}
): Promise<DashboardOrganizationRow | null> {
  const organizationSlug = getHeader(event, 'x-dashboard-org-slug')
  const explicitOrganizationId = options.explicitOrganizationId ?? null

  const headerOrg = organizationSlug
    ? await queryFirst<DashboardOrganizationRow>(db, `
        SELECT o.id, o.name, o.slug, o.logo, m.role, m.id AS memberId
        FROM organization o
        JOIN member m ON o.id = m.organizationId
        WHERE m.userId = ? AND o.slug = ?
        LIMIT 1
      `, [userId, organizationSlug])
    : null

  if (explicitOrganizationId) {
    if (headerOrg && headerOrg.id !== explicitOrganizationId) {
      throw createError({
        statusCode: 400,
        message: 'Organization context conflict: the requested organization does not match the current dashboard context.',
      })
    }
    if (headerOrg) return headerOrg

    return await queryFirst<DashboardOrganizationRow>(db, `
      SELECT o.id, o.name, o.slug, o.logo, m.role, m.id AS memberId
      FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ? AND o.id = ?
      LIMIT 1
    `, [userId, explicitOrganizationId])
  }

  if (headerOrg) return headerOrg

  const activeOrganizationId = options.activeOrganizationId ?? null
  if (!activeOrganizationId) return null

  return await queryFirst<DashboardOrganizationRow>(db, `
    SELECT o.id, o.name, o.slug, o.logo, m.role, m.id AS memberId
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ? AND o.id = ?
    LIMIT 1
  `, [userId, activeOrganizationId])
}

// Not a guess: the org-scoped /onboarding route has no siteSlug to attach a header
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

  // Session-wide activeOrganizationId is only ever considered when this specific
  // caller has declared it has no URL-scoped org context (requireOrganization: false —
  // the dashboard boot-discovery endpoint and the notifications badge, both of which
  // run outside any /dashboard/{orgSlug}/... route). Every other caller must resolve
  // strictly from x-dashboard-org-slug; a missing header there is a real error, not
  // a cue to guess from a session field that can be stale relative to the URL.
  const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string | null }
  const activeOrganizationId = options.requireOrganization === false && typeof sessionRecord.activeOrganizationId === 'string'
    ? sessionRecord.activeOrganizationId
    : null

  const organization = await resolveRequestedOrganization(event, db, session.user.id, { activeOrganizationId })

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
    const hasHeader = Boolean(getHeader(event, 'x-dashboard-org-slug'))
    throw createError({
      statusCode: hasHeader ? 404 : 400,
      message: hasHeader
        ? 'Organization not found'
        : 'Organization context is required. Use /dashboard/{orgSlug} routes.',
    })
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

  const site = siteSlug
    ? await queryFirst<DashboardSiteRow>(db, `
        SELECT id, organization_id, brand_name, vertical, subdomain, custom_domain, public_url,
               status, onboarding_status, plan, primary_location_id, default_currency, source_locale
        FROM sites
        WHERE organization_id = ? AND subdomain = ?
        LIMIT 1
      `, [organization.id, siteSlug])
    : options.allowTransferFallback
      ? await resolveRecentlyTransferredSite(db, organization.id, session.user.id)
      : null

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
    SELECT business_locations.id, business_locations.slug, business_locations.title,
           business_locations.is_primary, business_locations.status,
           business_locations.city, business_locations.address,
           COALESCE(ma_hero.thumbnail_url, ma_hero.public_url) as hero_url
    FROM business_locations
    LEFT JOIN media_assets ma_hero ON ma_hero.id = business_locations.hero_image_asset_id
    WHERE business_locations.organization_id = ? AND business_locations.site_id = ? AND business_locations.status = 'active'
      ${principal && !isOrganizationWideRole(principal.role) ? 'AND EXISTS (SELECT 1 FROM member_access_scope mas WHERE mas.member_id = ? AND mas.organization_id = business_locations.organization_id AND mas.site_id = business_locations.site_id AND (mas.location_id IS NULL OR mas.location_id = business_locations.id))' : ''}
    ORDER BY is_primary DESC, title ASC
  `, principal && !isOrganizationWideRole(principal.role) ? [organizationId, siteId, principal.memberId] : [organizationId, siteId])

  return locations.map((location) => ({
    ...location,
    is_primary: Boolean(location.is_primary),
    address: parseLocationAddress(location.address)
  }))
}
