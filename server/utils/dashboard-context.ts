import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'

import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertDashboardPathPermission, assertMemberSiteAccess, isOrganizationWideRole, resolveUserOrganization } from '~/server/utils/member-access'

function safeJsonParse(value: string): unknown {
  return JSON.parse(value)
}

// business_locations.address is written exclusively as { addressLines: string[] }
// (see normalizeAddressLines in location-management.ts) — this guards against
// malformed/legacy rows that predate that normalization rather than trusting an
// unchecked cast, which would otherwise silently hand callers a shape that
// doesn't match what they expect from the address contract.
function parseLocationAddress(value: string | null): { addressLines: string[] } | null {
  if (!value) return null
  const parsed = safeJsonParse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stored location address is invalid')
  const addressLines = (parsed as Record<string, unknown>).addressLines
  if (!Array.isArray(addressLines) || !addressLines.every(line => typeof line === 'string')) throw new Error('Stored location address lines are invalid')
  return { addressLines }
}

export interface DashboardOrganizationRow {
  id: string
  name: string
  slug: string
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
  // JSON { enabled?: ProductFeature[]; disabled?: ProductFeature[] } delta (config/cms-registry.ts),
  // or null for pure vertical defaults — see resolveSiteCmsCapabilities
  // (server/utils/cms-capabilities.ts), the one place this is parsed.
  feature_overrides: string | null
  theme_id: string
}

export interface DashboardLocationRow {
  id: string
  slug: string
  title: string
  is_primary: number | boolean
  status: string
  city: string | null
  address: string | null
  media: Array<{ asset_id: string; slot: 'hero'; public_url: string; thumbnail_url: string | null; kind: string | null }>
  // Same contract as DashboardSiteRow.feature_overrides, one scope down — the delta is applied
  // on top of the parent site's effective feature set (never the vertical defaults directly).
  feature_overrides: string | null
}

export interface DashboardLocationContextRow {
  id: string
  organization_id: string
  site_id: string
  slug: string
  title: string
  address: string | null
  city: string | null
  neighborhood: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  maps_url: string | null
  opening_hours: string | null
  rating: number | null
  review_count: number | null
  is_primary: number | boolean
  status: string
  last_synced_at: string | null
  description: string | null
  short_description: string | null
  price_level: string | null
  google_place_id: string | null
  google_review_url: string | null
  notification_phone: string | null
  timezone: string | null
  feature_overrides: string | null
}

export interface DashboardContextOptions {
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
  organizationSlug?: string | null
  // Explicit site scope used by transfer onboarding when a transferred site
  // has no generated subdomain (for example a custom-domain-only site).
  // Membership and organization ownership are still enforced by the same
  // canonical site query and assertMemberSiteAccess call below.
  siteId?: string | null
  siteSlug?: string | null
  // The scoped-role path allowlist (SCOPED_ROLE_DASHBOARD_ROUTES) only lists
  // /api/dashboard/* patterns. event.path is correct when a real API route
  // handler calls this directly, but SSR callers that bypass the self-fetch
  // (see AGENTS.md) invoke this with the *page's* own event to preserve
  // Cloudflare bindings — event.path there is a /dashboard/... page path,
  // which never matches the allowlist and would 403 every scoped-role page
  // load regardless of whether that page is actually restricted. Those
  // callers must pass the /api/dashboard/* path they're logically emulating.
  pathname?: string
}

export interface ResolveOrganizationOptions {
  organizationSlug?: string | null
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
  _db: DbClient,
  userId: string,
  options: ResolveOrganizationOptions = {}
): Promise<DashboardOrganizationRow | null> {
  const organizationSlug = options.organizationSlug ?? (event.req.headers.get('x-dashboard-org-slug'))
  const explicitOrganizationId = options.explicitOrganizationId ?? null
  const env = cloudflareEnv(event)

  const headerOrg = organizationSlug
    ? await resolveUserOrganization(env, { userId, organizationSlug })
    : null

  if (explicitOrganizationId) {
    if (headerOrg && headerOrg.id !== explicitOrganizationId) {
      throw new HTTPError({
        statusCode: 400,
        message: 'Organization context conflict: the requested organization does not match the current dashboard context.',
      })
    }
    if (headerOrg) return headerOrg

    return await resolveUserOrganization(env, { userId, organizationId: explicitOrganizationId })
  }

  if (headerOrg) return headerOrg

  const activeOrganizationId = options.activeOrganizationId ?? null
  if (!activeOrganizationId) return null

  return await resolveUserOrganization(env, { userId, organizationId: activeOrganizationId })
}

// Not a guess: the org-scoped /onboarding route has no siteSlug to attach a header
// from, and a recipient who already owned a site before accepting a handoff legitimately
// ends up with 2+ sites. The site this route means is unambiguous — whichever site this
// exact user most recently accepted a transfer into — so resolve it precisely instead of
// falling back to null the way genuine multi-site ambiguity does.
async function resolveRecentlyTransferredSite(db: DbClient, organizationId: string, userId: string): Promise<DashboardSiteRow | null> {
  return await queryFirst<DashboardSiteRow>(db, `
    SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, s.custom_domain, s.public_url,
           s.status, s.onboarding_status, s.plan, s.primary_location_id, s.default_currency, s.source_locale,
           s.feature_overrides
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
    throw new HTTPError({ statusCode: 503, message: 'Database not available' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw new HTTPError({ statusCode: 401, message: 'Authentication required' })
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

  const organization = await resolveRequestedOrganization(event, db, session.user.id, {
    activeOrganizationId,
    organizationSlug: options.organizationSlug,
  })

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
    const hasHeader = Boolean(options.organizationSlug ?? (event.req.headers.get('x-dashboard-org-slug')))
    throw new HTTPError({
      statusCode: hasHeader ? 404 : 400,
      message: hasHeader
        ? 'Organization not found'
        : 'Organization context is required. Use /dashboard/{orgSlug} routes.',
    })
  }
  assertDashboardPathPermission(organization.role, options.pathname ?? event.path)

  // The organization and active site are resolved explicitly from the route segments,
  // sent on every /api/dashboard/* request via dashboard headers (see
  // plugins/dashboard-site-header.client.ts). All dashboard routes must include the site
  // explicitly in the URL path for multi-site support. Callers that pass
  // `requireSite: false` (onboarding, org-level routes, and this function's own
  // discovery endpoint /api/dashboard/context) are explicitly designed to work
  // before a site is known/selected, so a missing header there means "no site
  // selected yet" rather than a client error — only callers that need a site
  // get the hard 400.
  const siteId = options.siteId ?? null
  const siteSlug = options.siteSlug ?? (event.req.headers.get('x-dashboard-site-slug'))

  if (!siteId && !siteSlug && options.requireSite !== false) {
    throw new HTTPError({ statusCode: 400, message: 'Site slug is required. Use /dashboard/{orgSlug}/sites/{siteSlug} routes.' })
  }

  const site = siteId
    ? await queryFirst<DashboardSiteRow>(db, `
        SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, s.custom_domain, s.public_url,
               s.status, s.onboarding_status, s.plan, s.primary_location_id, s.default_currency, s.source_locale,
               s.feature_overrides, s.theme_id
        FROM sites s
        WHERE s.organization_id = ? AND s.id = ?
        LIMIT 1
      `, [organization.id, siteId])
    : siteSlug
      ? await queryFirst<DashboardSiteRow>(db, `
        SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, s.custom_domain, s.public_url,
               s.status, s.onboarding_status, s.plan, s.primary_location_id, s.default_currency, s.source_locale,
               s.feature_overrides, s.theme_id
        FROM sites s
        WHERE s.organization_id = ? AND s.subdomain = ?
        LIMIT 1
        `, [organization.id, siteSlug])
      : options.allowTransferFallback
        ? await resolveRecentlyTransferredSite(db, organization.id, session.user.id)
        : null

  if (!site && options.requireSite !== false) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found' })
  }

  if (site) {
    await assertMemberSiteAccess(db, {
      env,
      memberId: organization.memberId,
      role: organization.role,
      organizationId: organization.id,
      siteId: site.id,
    })
  }

  return {
    env,
    db,
    session,
    userId: session.user.id,
    organization,
    site,
  }
}

export interface DashboardSiteSummaryRow {
  id: string
  team_id: string | null
  brand_name: string | null
  subdomain: string | null
  vertical: string | null
  status: string | null
  onboarding_status: string | null
  plan: string | null
  media: Array<{ asset_id: string; slot: 'media'; public_url: string; thumbnail_url: string | null; kind: string | null }>
}

export async function listOrganizationSites(
  db: DbClient,
  organizationId: string,
  principal?: { role: string; teamIds: string[] | null },
) {
  const scopedTeamIds = principal && !isOrganizationWideRole(principal.role) ? principal.teamIds ?? [] : null
  if (scopedTeamIds && scopedTeamIds.length === 0) return []
  const scopedTeamPlaceholders = scopedTeamIds?.map(() => '?').join(', ') ?? ''
  const rows = await queryAll<Omit<DashboardSiteSummaryRow, 'media'>>(db, `
    SELECT s.id, s.team_id, s.brand_name, s.subdomain, s.vertical, s.status,
           s.onboarding_status, s.plan
    FROM sites s
    WHERE s.organization_id = ?
      ${scopedTeamIds ? `AND s.team_id IN (${scopedTeamPlaceholders})` : ''}
    ORDER BY s.created_at ASC, s.id ASC
  `, scopedTeamIds ? [organizationId, ...scopedTeamIds] : [organizationId])

  const homeRows = await queryAll<{
    site_id: string
    asset_id: string | null
    hero_kind: string | null
    hero_media_public_url: string | null
    hero_media_thumbnail_url: string | null
  }>(db, `
    SELECT v.site_id, ma.id AS asset_id, ma.kind AS hero_kind,
           ma.public_url AS hero_media_public_url, ma.thumbnail_url AS hero_media_thumbnail_url
      FROM tenant_page_variants v
      JOIN site_locales sl
        ON sl.site_id = v.site_id
       AND sl.organization_id = v.organization_id
       AND sl.locale = v.locale
       AND sl.is_source = 1
      LEFT JOIN content_blocks cb
        ON cb.document_id = v.document_id
       AND cb.type = 'hero'
      LEFT JOIN media_placements hero_placement
        ON hero_placement.owner_type = 'content_block' AND hero_placement.owner_id = cb.id AND hero_placement.slot = 'media' AND hero_placement.status = 'active'
      LEFT JOIN media_assets ma
        ON ma.id = hero_placement.asset_id
       AND ma.organization_id = v.organization_id
       AND ma.site_id = v.site_id
       AND ma.status = 'active'
     WHERE v.organization_id = ? AND v.path = '/'
     ORDER BY v.site_id, cb.position ASC
  `, [organizationId])
  const homeBySite = new Map<string, (typeof homeRows)[number]>()
  for (const home of homeRows) if (!homeBySite.has(home.site_id)) homeBySite.set(home.site_id, home)

  return rows.map(row => {
    const home = homeBySite.get(row.id)
    return {
      ...row,
      media: home?.asset_id && home.hero_media_public_url
        ? [{ asset_id: home.asset_id, slot: 'media' as const, public_url: home.hero_media_public_url, thumbnail_url: home.hero_media_thumbnail_url, kind: home.hero_kind }]
        : [],
    }
  })
}

export async function getDashboardSite(event: H3Event) {
  const context = await getDashboardContext(event, { requireSite: true })
  if (!context.site) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found' })
  }
  return {
    ...context,
    site: context.site
  }
}

export async function getDashboardLocationContext(event: H3Event, locationId: string): Promise<{
  env: ReturnType<typeof cloudflareEnv>
  db: D1Database
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  userId: string
  organization: DashboardOrganizationRow
  location: DashboardLocationContextRow
}> {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    throw new HTTPError({ statusCode: 503, message: 'Database not available' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw new HTTPError({ statusCode: 401, message: 'Authentication required' })
  }

  const row = await queryFirst<DashboardLocationContextRow>(db, `
    SELECT bl.*
    FROM business_locations bl
    WHERE bl.id = ?
    LIMIT 1
  `, [locationId])

  if (!row) {
    throw new HTTPError({ statusCode: 404, message: 'Location not found' })
  }

  const organization = await resolveUserOrganization(env, {
    userId: session.user.id,
    organizationId: row.organization_id,
  })
  if (!organization) throw new HTTPError({ statusCode: 404, message: 'Location not found' })

  assertDashboardPathPermission(organization.role, event.path)

  return {
    env,
    db,
    session,
    userId: session.user.id,
    organization,
    location: row,
  }
}

export async function listDashboardLocations(
  db: DbClient,
  organizationId: string,
  siteId: string,
  principal?: { role: string; teamIds: string[] | null },
) {
  const scopedTeamIds = principal && !isOrganizationWideRole(principal.role) ? principal.teamIds ?? [] : null
  if (scopedTeamIds && scopedTeamIds.length === 0) return []
  const siteTeamPlaceholders = scopedTeamIds?.map(() => '?').join(', ') ?? ''
  const locationTeamPlaceholders = scopedTeamIds?.map(() => '?').join(', ') ?? ''
  const locations = await queryAll<Omit<DashboardLocationRow, 'media'> & {
    hero_asset_id: string | null
    hero_kind: string | null
    hero_media_public_url: string | null
    hero_media_thumbnail_url: string | null
  }>(db, `
    SELECT business_locations.id, business_locations.slug, business_locations.title,
           business_locations.is_primary, business_locations.status,
           business_locations.city, business_locations.address, business_locations.feature_overrides,
           ma_hero.id AS hero_asset_id,
           ma_hero.kind AS hero_kind,
           ma_hero.public_url AS hero_media_public_url,
           ma_hero.thumbnail_url AS hero_media_thumbnail_url
    FROM business_locations
    JOIN sites ON sites.id = business_locations.site_id AND sites.organization_id = business_locations.organization_id
    LEFT JOIN media_placements mp_hero ON mp_hero.owner_type = 'business_location' AND mp_hero.owner_id = business_locations.id AND mp_hero.slot = 'hero' AND mp_hero.status = 'active'
    LEFT JOIN media_assets ma_hero ON ma_hero.id = mp_hero.asset_id
      AND ma_hero.organization_id = business_locations.organization_id AND ma_hero.site_id = business_locations.site_id AND ma_hero.status = 'active'
    WHERE business_locations.organization_id = ? AND business_locations.site_id = ? AND business_locations.status = 'active'
      ${scopedTeamIds ? `AND (sites.team_id IN (${siteTeamPlaceholders}) OR business_locations.team_id IN (${locationTeamPlaceholders}))` : ''}
    ORDER BY is_primary DESC, title ASC
  `, scopedTeamIds ? [organizationId, siteId, ...scopedTeamIds, ...scopedTeamIds] : [organizationId, siteId])

  return locations.map((location) => {
    const { hero_asset_id, hero_kind, hero_media_public_url, hero_media_thumbnail_url, ...fields } = location
    return {
      ...fields,
      id: location.id,
      slug: location.slug,
      title: location.title,
      is_primary: Boolean(location.is_primary),
      status: location.status,
      city: location.city,
      address: parseLocationAddress(location.address),
      feature_overrides: location.feature_overrides,
      media: hero_asset_id && hero_media_public_url
        ? [{ asset_id: hero_asset_id, slot: 'hero' as const, public_url: hero_media_public_url, thumbnail_url: hero_media_thumbnail_url, kind: hero_kind }]
        : [],
    }
  })
}
