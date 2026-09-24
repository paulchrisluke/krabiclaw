import { HTTPError } from 'nitro'
import { resolveSocialImageFromMedia } from '~/utils/social-metadata';
import { getQuery } from 'nitro/h3';

import type { H3Event } from 'nitro'

import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertOrganizationWideAccess, memberAccessPrincipal, resolveUserOrganization, type ResolvedMembership } from '~/server/utils/member-access'
import { getOrganizationPlan } from '~/server/utils/billing-access'

import { parsePostalAddress } from '~/utils/postal-address'

/**
 * The tenant's own configuration, read from the `organization` row.
 *
 * These columns used to live on a `sites` row hanging off the organization, so
 * every dashboard request resolved a membership and then a second row to learn
 * what the business actually is. There is one row now, and `name` on the
 * membership carries what `sites.brand_name` carried.
 */
export interface DashboardOrganizationConfig {
  theme_id: string
  vertical: string | null
  subdomain: string | null
  custom_domain: string | null
  public_url: string | null
  status: string
  onboarding_status: string
  default_currency: string | null
  feature_overrides: string | null
}

export type DashboardOrganizationRow = ResolvedMembership & {
  id: string
  name: string
  slug: string
  // Set while a deletion is pending: the tenant keeps serving until the
  // deletion-sweep task runs, and an owner can cancel until then.
  deletionScheduledAt: string | null
} & DashboardOrganizationConfig

const ORGANIZATION_CONFIG_SQL = `
  SELECT theme_id, vertical, subdomain,
         (SELECT domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain,
         (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active') AS public_url,
         status, onboarding_status, default_currency, feature_overrides
  FROM organization WHERE id = ? LIMIT 1
`

// One loader for the tenant's social media, used by every dashboard surface so
// two of them cannot report different images for the same business. Slots and
// resolution order match the public surfaces exactly.
//
// Cards render the same image the public pages do. The dashboard used to run
// its own query against the home page hero block's social_card — a different
// owner from the one public reads — which is why it showed nothing while the
// public site rendered fine.
export type DashboardOrganizationMedia = Array<{ asset_id: string, slot: string, public_url: string, thumbnail_url: string | null, kind: string | null }>

async function loadOrganizationSocialMedia(db: DbClient, organizationId: string): Promise<DashboardOrganizationMedia> {
  return await queryAll<DashboardOrganizationMedia[number]>(db, `
    SELECT ma.id AS asset_id, mp.slot,
           ma.public_url, ma.thumbnail_url, ma.kind
      FROM media_placements mp
      JOIN media_assets ma
        ON ma.id = mp.asset_id
       AND ma.status = 'active'
       AND ma.organization_id = mp.organization_id
     WHERE mp.organization_id = ?
       AND mp.owner_type = 'organization'
       AND mp.status = 'active'
       AND mp.slot IN ('social_card', 'social_share', 'logo')
     ORDER BY mp.sort_order ASC
  `, [organizationId])
}

/** The presentation the tenant card needs: the plan and the media, one read each. */
export interface DashboardOrganizationCard {
  effective_plan: string
  media: DashboardOrganizationMedia
  social_image: { url: string, width?: number, height?: number, type?: string } | null
}

export async function loadDashboardOrganizationCard(
  env: CloudflareEnv,
  db: DbClient,
  organizationId: string,
): Promise<DashboardOrganizationCard> {
  const [effectivePlan, media] = await Promise.all([
    getOrganizationPlan(env, organizationId),
    loadOrganizationSocialMedia(db, organizationId),
  ])
  return { effective_plan: effectivePlan, media, social_image: resolveSocialImageFromMedia(media) }
}

export interface DashboardLocationRow {
  id: string
  slug: string
  title: string
  status: string
  address: string | null
  media: Array<{ asset_id: string; slot: 'hero'; public_url: string; thumbnail_url: string | null; kind: string | null }>
  // The delta is applied on top of the organization's effective feature set
  // (never the vertical defaults directly).
  feature_overrides: string | null
}

export interface DashboardLocationContextRow {
  id: string
  organization_id: string
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
  timezone: string | null
  feature_overrides: string | null
}

export interface DashboardContextOptions {
  requireOrganization?: boolean
  organizationSlug?: string | null
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
// truth for which org a request is for. dashboardFetch (composables/dashboardFetch.ts)
// sends that route context on every /api/dashboard/* request as an explicit,
// visible `org` query param rather than a bespoke request header.
export function dashboardOrgQueryParam(event: H3Event): string | null {
  const value = getQuery(event).org
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
) {
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
}>
export async function getDashboardContext(event: H3Event, options: DashboardContextOptions = {}): Promise<{
  env: ReturnType<typeof cloudflareEnv>
  db: D1Database
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  userId: string
  organization: DashboardOrganizationRow | null
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

  const membership = await resolveRequestedOrganization(event, db, session.user.id, {
    activeOrganizationId,
    organizationSlug: options.organizationSlug,
  })

  if (!membership) {
    if (options.requireOrganization === false) {
      return { env, db, session, userId: session.user.id, organization: null }
    }
    const hasQueryParam = Boolean(options.organizationSlug ?? dashboardOrgQueryParam(event))
    throw new HTTPError({
      statusCode: hasQueryParam ? 404 : 400,
      message: hasQueryParam
        ? 'Organization not found'
        : 'Organization context is required. Use /dashboard/{orgSlug} routes.',
    })
  }

  // Better Auth owns the membership and the organization's identity; its own
  // adapter does not return the tenant configuration columns beside them, so
  // they are read here from the same row and carried on one object.
  const config = await queryFirst<DashboardOrganizationConfig>(db, ORGANIZATION_CONFIG_SQL, [membership.id])
  if (!config) {
    throw new HTTPError({ statusCode: 404, message: 'Organization not found' })
  }
  const organization: DashboardOrganizationRow = Object.assign(membership, config)

  await assertOrganizationWideAccess(db, memberAccessPrincipal(organization, { env, event }))

  return { env, db, session, userId: session.user.id, organization }
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

  const membership = await resolveUserOrganization(env, {
    userId: session.user.id,
    organizationId: row.organization_id,
  }, event)
  if (!membership) throw new HTTPError({ statusCode: 404, message: 'Location not found' })

  const config = await queryFirst<DashboardOrganizationConfig>(db, ORGANIZATION_CONFIG_SQL, [membership.id])
  if (!config) throw new HTTPError({ statusCode: 404, message: 'Organization not found' })

  return {
    env,
    db,
    session,
    userId: session.user.id,
    organization: Object.assign(membership, config),
    location: row,
  }
}

export async function listDashboardLocations(
  db: DbClient,
  organizationId: string,
) {

  const locations = await queryAll<Omit<DashboardLocationRow, 'media'> & {
    hero_asset_id: string | null
    hero_kind: string | null
    hero_media_public_url: string | null
    hero_media_thumbnail_url: string | null
    social_asset_id: string | null
    social_kind: string | null
    social_public_url: string | null
    social_thumbnail_url: string | null
  }>(db, `
    SELECT business_locations.id, business_locations.slug, business_locations.title,
           business_locations.status,
           business_locations.address, business_locations.feature_overrides,
           ma_hero.id AS hero_asset_id,
           ma_hero.kind AS hero_kind,
           ma_hero.public_url AS hero_media_public_url,
           ma_hero.thumbnail_url AS hero_media_thumbnail_url,
           ma_social.id AS social_asset_id,
           ma_social.kind AS social_kind,
           ma_social.public_url AS social_public_url,
           ma_social.thumbnail_url AS social_thumbnail_url
    FROM business_locations
    LEFT JOIN media_placements mp_hero ON mp_hero.owner_type = 'business_location' AND mp_hero.owner_id = business_locations.id AND mp_hero.slot = 'hero' AND mp_hero.status = 'active'
    LEFT JOIN media_assets ma_hero ON ma_hero.id = mp_hero.asset_id
      AND ma_hero.organization_id = business_locations.organization_id AND ma_hero.status = 'active'
    LEFT JOIN media_placements mp_social ON mp_social.owner_type = 'business_location' AND mp_social.owner_id = business_locations.id AND mp_social.slot = 'social_card' AND mp_social.sort_order = 0 AND mp_social.status = 'active'
    LEFT JOIN media_assets ma_social ON ma_social.id = mp_social.asset_id
      AND ma_social.organization_id = business_locations.organization_id AND ma_social.status = 'active'
    WHERE business_locations.organization_id = ?
      AND business_locations.status = 'active'
    ORDER BY title ASC
  `, [organizationId])

  return locations.map((location) => {
    const { hero_asset_id, hero_kind, hero_media_public_url, hero_media_thumbnail_url,
      social_asset_id, social_kind, social_public_url, social_thumbnail_url, ...fields } = location
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
    }
  })
}
