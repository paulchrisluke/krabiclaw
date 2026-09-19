import { HTTPError } from 'nitro'
import { resolveSocialImageFromMedia } from '~/utils/social-metadata';
import { getQuery } from 'nitro/h3';

import type { H3Event } from 'nitro'

import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { assertMemberSiteAccess, isOrganizationWideRole, memberAccessPrincipal, resolveUserOrganization, type ResolvedMembership } from '~/server/utils/member-access'
import { getOrganizationPlan } from '~/server/utils/billing-access'

import { parsePostalAddress } from '~/utils/postal-address'


export interface DashboardOrganizationRow extends ResolvedMembership {
  id: string
  name: string
  slug: string
  logo: string | null
  // Set while a deletion is pending: the sites keep serving until the
  // deletion-sweep task runs, and an owner can cancel until then.
  deletionScheduledAt: string | null
}

// One loader for site-level social media, used by both the sites list and the
// single-site context so the two cannot report different images for the same
// site. Slots and resolution order match the public surfaces exactly.
//
// Site cards render the same image the public pages do. The dashboard used to
// run its own query against the home page hero block's social_card — a
// different owner from the one public reads — which is why it showed nothing
// while the public site rendered fine.
async function loadSiteSocialMedia(db: DbClient, organizationId: string) {
  const rows = await queryAll<{
    site_id: string
    asset_id: string
    slot: string
    public_url: string
    thumbnail_url: string | null
    kind: string | null
  }>(db, `
    SELECT mp.site_id, ma.id AS asset_id, mp.slot,
           ma.public_url, ma.thumbnail_url, ma.kind
      FROM media_placements mp
      JOIN media_assets ma
        ON ma.id = mp.asset_id
       AND ma.status = 'active'
       AND ma.organization_id = mp.organization_id
       AND ma.site_id = mp.site_id
     WHERE mp.organization_id = ?
       AND mp.owner_type = 'site'
       AND mp.status = 'active'
       AND mp.slot IN ('social_card', 'social_share', 'logo')
     ORDER BY mp.site_id, mp.sort_order ASC
  `, [organizationId])

  const bySite = new Map<string, Array<Omit<(typeof rows)[number], 'site_id'>>>()
  for (const { site_id: siteId, ...item } of rows) {
    const existing = bySite.get(siteId)
    if (existing) existing.push(item)
    else bySite.set(siteId, [item])
  }
  return bySite
}

/**
 * A site as authorization resolves it: identity, scope and settings, and nothing
 * that exists only to render a card. The plan and the site-card media are an
 * organization-wide read each, and every caller that only needs to know which
 * site it is allowed to touch was paying for both. They are added by
 * `decorateDashboardSiteCard` for the surfaces that actually draw cards.
 */
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
  default_currency: string | null
  feature_overrides: string | null
  theme_id: string
}

export type DashboardSiteMedia = Array<{ asset_id: string, slot: string, public_url: string, thumbnail_url: string | null, kind: string | null }>

/** The presentation a site card needs, loaded once per organization per request. */
export interface DashboardSiteCardEnrichment {
  effectivePlan: string
  mediaBySite: Map<string, DashboardSiteMedia>
}

export type DashboardSiteCardRow<Row> = Row & {
  effective_plan: string
  media: DashboardSiteMedia
  social_image: { url: string, width?: number, height?: number, type?: string } | null
}

/**
 * The organization plan and the site-card media, together, once. Both are
 * organization-wide, so a request that decorates a selected site *and* the
 * site list reads each of them a single time and shares the result rather than
 * repeating the pair per surface.
 */
export async function loadDashboardSiteCardEnrichment(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
): Promise<DashboardSiteCardEnrichment> {
  const [effectivePlan, mediaBySite] = await Promise.all([
    getOrganizationPlan(env, organizationId),
    loadSiteSocialMedia(db, organizationId),
  ])
  return { effectivePlan, mediaBySite }
}

export function decorateDashboardSiteCard<Row extends { id: string }>(
  row: Row,
  enrichment: DashboardSiteCardEnrichment,
): DashboardSiteCardRow<Row> {
  const media = enrichment.mediaBySite.get(row.id) ?? []
  return {
    ...row,
    effective_plan: enrichment.effectivePlan,
    media,
    social_image: resolveSocialImageFromMedia(media),
  }
}

export interface DashboardLocationRow {
  id: string
  slug: string
  title: string
  status: string
  address: string | null
  media: Array<{ asset_id: string; slot: 'hero'; public_url: string; thumbnail_url: string | null; kind: string | null }>
  // Same contract as DashboardSiteRow.feature_overrides, one scope down — the delta is applied
  // on top of the parent site's effective feature set (never the vertical defaults directly).
  feature_overrides: string | null
  // NEW fields for organization-scoped mode
  parent_site_id?: string
  parent_site_name?: string
  parent_site_slug?: string
}

export interface DashboardLocationContextRow {
  id: string
  organization_id: string
  site_id: string
  slug: string
  title: string
  address: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  maps_url: string | null
  opening_hours: string | null
  rating: number | null
  review_count: number | null
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
  requireOrganization?: boolean
  organizationSlug?: string | null
  // Explicit site scope used by transfer onboarding when a transferred site
  // has no generated subdomain (for example a custom-domain-only site).
  // Membership and organization ownership are still enforced by the same
  // canonical site query and assertMemberSiteAccess call below.
  siteId?: string | null
  siteSlug?: string | null
}

export interface ResolveOrganizationOptions {
  organizationSlug?: string | null
  // From an explicit caller-supplied param (e.g. billing's body/query organizationId).
  // Still membership-checked — never trusted outright.
  explicitOrganizationId?: string | null
  // The Better Auth session's session.activeOrganizationId, if the caller wants it
  // considered at all. Pass null/undefined to make this resolution strictly
  // query-param/explicit-param-only (the required behavior for billing and any other
  // URL-scoped route — a stale session-wide active org must never silently stand
  // in for the org actually named in the request).
  activeOrganizationId?: string | null
}

// The dashboard SPA's route (/dashboard/{orgSlug}/...) is the only source of
// truth for which org/site a request is for. dashboardFetch (composables/dashboardFetch.ts)
// sends that route context on every /api/dashboard/* request as explicit,
// visible `org`/`site` query params rather than a bespoke request header.
function dashboardOrgQueryParam(event: H3Event): string | null {
  const value = getQuery(event).org
  return typeof value === 'string' && value ? value : null
}

function dashboardSiteQueryParam(event: H3Event): string | null {
  const value = getQuery(event).site
  return typeof value === 'string' && value ? value : null
}

// The one place "which org is this request for" gets decided. Both explicit params
// and the `org` query param are membership-checked before being trusted;
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
  const organizationSlug = options.organizationSlug ?? dashboardOrgQueryParam(event)
  const explicitOrganizationId = options.explicitOrganizationId ?? null
  const env = cloudflareEnv(event)

  const headerOrg = organizationSlug
    ? await resolveUserOrganization(env, { userId, organizationSlug }, event)
    : null

  if (explicitOrganizationId) {
    if (headerOrg && headerOrg.id !== explicitOrganizationId) {
      throw new HTTPError({
        statusCode: 400,
        message: 'Organization context conflict: the requested organization does not match the current dashboard context.',
      })
    }
    if (headerOrg) return headerOrg

    return await resolveUserOrganization(env, { userId, organizationId: explicitOrganizationId }, event)
  }

  if (headerOrg) return headerOrg

  const activeOrganizationId = options.activeOrganizationId ?? null
  if (!activeOrganizationId) return null

  return await resolveUserOrganization(env, { userId, organizationId: activeOrganizationId }, event)
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
  // strictly from the `org` query param; a missing one there is a real error, not
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
    const hasQueryParam = Boolean(options.organizationSlug ?? dashboardOrgQueryParam(event))
    throw new HTTPError({
      statusCode: hasQueryParam ? 404 : 400,
      message: hasQueryParam
        ? 'Organization not found'
        : 'Organization context is required. Use /dashboard/{orgSlug} routes.',
    })
  }

  // The organization and active site are resolved explicitly from the route segments,
  // sent on every /api/dashboard/* request as `org`/`site` query params (see
  // composables/dashboardFetch.ts). All dashboard routes must include the site
  // explicitly in the URL path for multi-site support. Callers that pass
  // `requireSite: false` (onboarding, org-level routes, and this function's own
  // discovery endpoint /api/dashboard/context) are explicitly designed to work
  // before a site is known/selected, so a missing query param there means "no site
  // selected yet" rather than a client error — only callers that need a site
  // get the hard 400.
  const siteId = options.siteId ?? null
  const siteSlug = options.siteSlug ?? dashboardSiteQueryParam(event)

  if (!siteId && !siteSlug && options.requireSite !== false) {
    throw new HTTPError({ statusCode: 400, message: 'Site slug is required. Use /dashboard/{orgSlug}/sites/{siteSlug} routes.' })
  }

  const site = siteId
    ? await queryFirst<DashboardSiteRow>(db, `
        SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, (SELECT domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active') AS public_url,
               s.status, s.onboarding_status, s.default_currency,
               s.feature_overrides, s.theme_id
        FROM sites s
        WHERE s.organization_id = ? AND s.id = ?
        LIMIT 1
      `, [organization.id, siteId])
    : siteSlug
      ? await queryFirst<DashboardSiteRow>(db, `
        SELECT s.id, s.organization_id, s.brand_name, s.vertical, s.subdomain, (SELECT domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active') AS public_url,
               s.status, s.onboarding_status, s.default_currency,
               s.feature_overrides, s.theme_id
        FROM sites s
        WHERE s.organization_id = ? AND s.subdomain = ?
        LIMIT 1
        `, [organization.id, siteSlug])
      : null

  if (!site && options.requireSite !== false) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found' })
  }

  if (site) {
    await assertMemberSiteAccess(db, memberAccessPrincipal(organization, { env, siteId: site.id, event }))
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
}

/**
 * The sites this principal may see, as scope rows. Card presentation is not
 * loaded here: a caller that draws cards loads the enrichment once with
 * `loadDashboardSiteCardEnrichment` and applies it, and a caller that only
 * needs names and ids pays for neither.
 */
export async function listOrganizationSites(
  db: DbClient,
  organizationId: string,
  principal?: { role: string; teamIds: string[] | null },
) {
  const scopedTeamIds = principal && !isOrganizationWideRole(principal.role) ? principal.teamIds ?? [] : null
  if (scopedTeamIds && scopedTeamIds.length === 0) return []
  const scopedTeamIdsJson = scopedTeamIds ? d1JsonStringSet(scopedTeamIds) : null
  return queryAll<DashboardSiteSummaryRow>(db, `
    SELECT s.id, s.team_id, s.brand_name, s.subdomain, s.vertical, s.status,
           s.onboarding_status
    FROM sites s
    WHERE s.organization_id = ?
      ${scopedTeamIds ? `AND s.team_id IN (SELECT value FROM json_each(?))` : ''}
    ORDER BY s.created_at ASC, s.id ASC
  `, scopedTeamIdsJson ? [organizationId, scopedTeamIdsJson] : [organizationId])
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
  }, event)
  if (!organization) throw new HTTPError({ statusCode: 404, message: 'Location not found' })

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
  siteId: string | null,
  principal?: { role: string; teamIds: string[] | null },
  organizationScoped?: boolean,
) {
  const scopedTeamIds = principal && !isOrganizationWideRole(principal.role) ? principal.teamIds ?? [] : null
  if (scopedTeamIds && scopedTeamIds.length === 0) return []
  const scopedTeamIdsJson = scopedTeamIds ? d1JsonStringSet(scopedTeamIds) : null
  const isOrgWide = principal && isOrganizationWideRole(principal.role)

  const locations = await queryAll<Omit<DashboardLocationRow, 'media'> & {
    hero_asset_id: string | null
    hero_kind: string | null
    hero_media_public_url: string | null
    hero_media_thumbnail_url: string | null
    social_asset_id: string | null
    social_kind: string | null
    social_public_url: string | null
    social_thumbnail_url: string | null
    parent_site_id?: string
    parent_site_name?: string
    parent_site_slug?: string
  }>(db, `
    SELECT business_locations.id, business_locations.slug, business_locations.title,
           business_locations.status,
           business_locations.address, business_locations.feature_overrides,
           ${organizationScoped ? `sites.id AS parent_site_id, sites.brand_name AS parent_site_name, sites.subdomain AS parent_site_slug,` : ''}
           ma_hero.id AS hero_asset_id,
           ma_hero.kind AS hero_kind,
           ma_hero.public_url AS hero_media_public_url,
           ma_hero.thumbnail_url AS hero_media_thumbnail_url,
           ma_social.id AS social_asset_id,
           ma_social.kind AS social_kind,
           ma_social.public_url AS social_public_url,
           ma_social.thumbnail_url AS social_thumbnail_url
    FROM business_locations
    JOIN sites ON sites.id = business_locations.site_id AND sites.organization_id = business_locations.organization_id
    LEFT JOIN media_placements mp_hero ON mp_hero.owner_type = 'business_location' AND mp_hero.owner_id = business_locations.id AND mp_hero.slot = 'hero' AND mp_hero.status = 'active'
    LEFT JOIN media_assets ma_hero ON ma_hero.id = mp_hero.asset_id
      AND ma_hero.organization_id = business_locations.organization_id AND ma_hero.site_id = business_locations.site_id AND ma_hero.status = 'active'
    LEFT JOIN media_placements mp_social ON mp_social.owner_type = 'business_location' AND mp_social.owner_id = business_locations.id AND mp_social.slot = 'social_card' AND mp_social.sort_order = 0 AND mp_social.status = 'active'
    LEFT JOIN media_assets ma_social ON ma_social.id = mp_social.asset_id
      AND ma_social.organization_id = business_locations.organization_id AND ma_social.site_id = business_locations.site_id AND ma_social.status = 'active'
    WHERE business_locations.organization_id = ?
      ${organizationScoped ? '' : 'AND business_locations.site_id = ?'}
      AND business_locations.status = 'active'
      ${!isOrgWide && scopedTeamIds ? `
        AND (
          sites.team_id IN (SELECT value FROM json_each(?))
          OR business_locations.team_id IN (SELECT value FROM json_each(?))
        )
      ` : ''}
    ORDER BY title ASC
  `, organizationScoped
    ? (isOrgWide ? [organizationId] : [organizationId, scopedTeamIdsJson, scopedTeamIdsJson])
    : (scopedTeamIdsJson ? [organizationId, siteId!, scopedTeamIdsJson, scopedTeamIdsJson] : [organizationId, siteId!]))

  return locations.map((location) => {
    const { hero_asset_id, hero_kind, hero_media_public_url, hero_media_thumbnail_url,
      social_asset_id, social_kind, social_public_url, social_thumbnail_url,
      parent_site_id, parent_site_name, parent_site_slug, ...fields } = location
    const ownerMedia = [
      ...(social_asset_id && social_public_url
        ? [{ asset_id: social_asset_id, slot: 'social_card' as const, public_url: social_public_url, thumbnail_url: social_thumbnail_url, kind: social_kind }]
        : []),
      ...(hero_asset_id && hero_media_public_url
        ? [{ asset_id: hero_asset_id, slot: 'hero' as const, public_url: hero_media_public_url, thumbnail_url: hero_media_thumbnail_url, kind: hero_kind }]
        : []),
    ]
    return {
      ...fields,
      id: location.id,
      slug: location.slug,
      title: location.title,
      status: location.status,
      address: parsePostalAddress(location.address),
      feature_overrides: location.feature_overrides,
      media: ownerMedia,
      social_image: resolveSocialImageFromMedia(ownerMedia),
      ...(organizationScoped
        && typeof parent_site_id === 'string' && parent_site_id.length > 0
        && typeof parent_site_name === 'string' && parent_site_name.length > 0
        && typeof parent_site_slug === 'string' && parent_site_slug.length > 0 ? {
        parent_site_id,
        parent_site_name,
        parent_site_slug,
      } : {}),
    }
  })
}
