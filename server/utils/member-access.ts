import { HTTPError } from 'nitro';

import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrgAdapter } from 'better-auth/plugins'
import { parsePhoneOrThrow } from '~/utils/phone'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  parseResourceTeamGeneration,
  RESOURCE_TEAM_GENERATION_CONFIG_KEY,
} from '~/shared/site-transfer-policy'

// Tenant-scoped authorization is Better Auth organization role plus Better
// Auth Teams membership. Owner/admin are organization-wide. Editors are scoped
// by membership in a site's team and/or one or more location teams.

/**
 * Composes the team-membership EXISTS predicate shared by every bulk query
 * that filters a set of rows (locations, events, notifications, member-owned
 * sites) down to what a scoped editor's Teams membership actually covers —
 * dashboard-home.ts, chowbot-conversations.ts, and whatsapp/webhook.post.ts
 * each independently wrote this same `EXISTS (SELECT 1 FROM teamMember tm
 * WHERE tm.userId = ... AND tm.teamId ...)` shape before this was extracted.
 *
 * A pure string builder rather than a per-row async function: every caller
 * here filters many rows in one query for performance (avoiding an N+1
 * `hasTeamAccess()` call per row), so the predicate has to compose into the
 * caller's own SQL, not replace it. Point-lookup checks (assertSiteWideAccess,
 * assertLocationAccess, etc. below) stay as their own queries — they're
 * already correct, already tested, and a single-row lookup gets no benefit
 * from string-templating its own predicate.
 *
 * `userIdExpr` is the caller's already-joined `member.userId` column
 * reference (e.g. `m.userId`). `siteTeamExpr`/`locationTeamExpr` are the
 * caller's `sites.team_id`/`business_locations.team_id` column references —
 * pass `locationTeamExpr` only when the row being filtered can itself be
 * location-scoped; omitting it produces a site-wide-only check.
 */
export function teamAccessPredicate(opts: {
  userIdExpr: string
  siteTeamExpr: string
  locationTeamExpr?: string | null
}): string {
  const teamIdMatch = opts.locationTeamExpr
    ? `tm.teamId IN (${opts.siteTeamExpr}, ${opts.locationTeamExpr})`
    : `tm.teamId = ${opts.siteTeamExpr}`
  return `EXISTS (SELECT 1 FROM teamMember tm WHERE tm.userId = ${opts.userIdExpr} AND ${teamIdMatch})`
}

export interface ResourceTeamAccess {
  organizationId: string
  siteId: string
  locationId: string | null
}

export interface ResourceScope {
  organizationId: string
  siteId: string
  locationId?: string | null
}

export interface MemberAccessPrincipal {
  memberId: string
  role: string
  organizationId: string
  siteId: string
}

export type DashboardSiteAccess = 'organization' | 'site' | 'location'

export async function resolveMemberId(
  input: { organizationId: string; userId: string; env: CloudflareEnv },
): Promise<string | null> {
  if (!input.env) {
    throw new Error('resolveMemberId requires CloudflareEnv so Better Auth can resolve organization membership')
  }
  const { createAuth } = await import('~/server/utils/auth')
  const auth = createAuth(input.env)
  const authContext = await auth.$context
  const orgAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
  const member = await orgAdapter.findMemberByOrgId({
    userId: input.userId,
    organizationId: input.organizationId,
  })
  return member?.id ?? null
}

export async function findLocationInSite(
  db: DbClient,
  input: { organizationId: string; siteId: string; locationId: string },
): Promise<{ id: string } | null> {
  return await queryFirst<{ id: string }>(db, `
    SELECT id FROM business_locations
    WHERE id = ? AND site_id = ? AND organization_id = ?
    LIMIT 1
  `, [input.locationId, input.siteId, input.organizationId])
}

export function isOrganizationWideRole(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export function isScopedRole(role: string): boolean {
  return role === 'editor'
}

// "Does this role participate in dashboard/notification/operational flows at
// all" — distinct from isOrganizationWideRole/isScopedRole, which describe
// how (unrestricted vs. scope-checked), not whether. Used to reject roles
// outside {owner, admin, editor} entirely (e.g. a future non-operational
// Better Auth role) before any scope check is even attempted.
export function isOperationalRole(role: string): boolean {
  return isOrganizationWideRole(role) || isScopedRole(role)
}

export function assertOrganizationAccess(role: string): void {
  if (!isOrganizationWideRole(role)) {
    throw new HTTPError({ statusCode: 403, message: 'Organization-level access required' })
  }
}

export function siteTeamId(siteId: string, generation?: string): string {
  return generation
    ? `site:${siteId}:generation:${generation}`
    : `site:${siteId}`
}

export function locationTeamId(locationId: string, generation?: string): string {
  return generation
    ? `location:${locationId}:generation:${generation}`
    : `location:${locationId}`
}

type OrganizationAdapter = ReturnType<typeof getOrgAdapter>

async function organizationAdapter(env: CloudflareEnv): Promise<OrganizationAdapter> {
  const { createAuth } = await import('~/server/utils/auth')
  const auth = createAuth(env)
  const context = await auth.$context
  return getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], {})
}

async function ensureTeam(
  env: CloudflareEnv,
  input: { organizationId: string; teamId: string; name: string },
): Promise<void> {
  const adapter = await organizationAdapter(env)
  const existing = await adapter.findTeamById({
    teamId: input.teamId,
    organizationId: input.organizationId,
  })
  if (existing) return

  // A deterministic team id makes this operation idempotent. Check the
  // unscoped id before creating so a collision can never attach a resource to
  // another organization.
  const conflicting = await adapter.findTeamById({ teamId: input.teamId })
  if (conflicting && conflicting.organizationId !== input.organizationId) {
    throw new Error(`Team ${input.teamId} belongs to another organization`)
  }
  if (conflicting) return

  try {
    await adapter.createTeam({
      id: input.teamId,
      name: input.name,
      organizationId: input.organizationId,
      createdAt: new Date(),
    })
  } catch (error) {
    // Another request may have won the create race. Re-read through Better
    // Auth before surfacing a real provisioning failure.
    const raced = await adapter.findTeamById({
      teamId: input.teamId,
      organizationId: input.organizationId,
    })
    if (!raced) throw error
  }
}

async function resourceTeamGeneration(
  db: DbClient,
  input: { organizationId: string; siteId: string },
): Promise<string | null> {
  const row = await queryFirst<{ value: string | null }>(db, `
    SELECT value
    FROM site_config
    WHERE organization_id = ? AND site_id = ? AND key = ?
    LIMIT 1
  `, [input.organizationId, input.siteId, RESOURCE_TEAM_GENERATION_CONFIG_KEY])

  // Absence of the transfer marker is the legacy path. Presence with a null,
  // non-string, or malformed value fails closed rather than silently falling
  // back to a pre-transfer deterministic id.
  if (!row) return null
  if (typeof row.value !== 'string') {
    throw new Error(`Invalid ${RESOURCE_TEAM_GENERATION_CONFIG_KEY}`)
  }
  return parseResourceTeamGeneration(row.value).generation
}

export async function ensureSiteTeam(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; name?: string | null },
): Promise<string> {
  const generation = await resourceTeamGeneration(db, input)
  return await ensureSiteTeamForGeneration(db, input, generation)
}

async function ensureSiteTeamForGeneration(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; name?: string | null },
  generation: string | null,
): Promise<string> {
  const teamId = siteTeamId(input.siteId, generation ?? undefined)
  await ensureTeam(input.env, {
    teamId,
    organizationId: input.organizationId,
    name: input.name?.trim() || `Site ${input.siteId}`,
  })
  await execute(db, `UPDATE sites SET team_id = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND (team_id IS NULL OR team_id != ?)`, [
    teamId,
    new Date().toISOString(),
    input.siteId,
    input.organizationId,
    teamId,
  ])
  return teamId
}

export async function ensureLocationTeam(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; locationId: string; name?: string | null },
): Promise<string> {
  const generation = await resourceTeamGeneration(db, input)
  return await ensureLocationTeamForGeneration(db, input, generation)
}

export async function ensureResourceTeams(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId?: string | null; locationId?: string | null },
): Promise<void> {
  const generation = input.siteId
    ? await resourceTeamGeneration(db, { organizationId: input.organizationId, siteId: input.siteId })
    : null
  if (input.siteId) await ensureSiteTeamForGeneration(db, { env: input.env, organizationId: input.organizationId, siteId: input.siteId }, generation)
  if (input.siteId && input.locationId) {
    await ensureLocationTeamForGeneration(db, {
      env: input.env,
      organizationId: input.organizationId,
      siteId: input.siteId,
      locationId: input.locationId,
    }, generation)
  }
}

async function ensureLocationTeamForGeneration(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; locationId: string; name?: string | null },
  generation: string | null,
): Promise<string> {
  const teamId = locationTeamId(input.locationId, generation ?? undefined)
  await ensureSiteTeamForGeneration(db, {
    env: input.env,
    organizationId: input.organizationId,
    siteId: input.siteId,
  }, generation)
  await ensureTeam(input.env, {
    teamId,
    organizationId: input.organizationId,
    name: input.name?.trim() || `Location ${input.locationId}`,
  })
  await execute(db, `UPDATE business_locations SET team_id = ?, updated_at = ? WHERE id = ? AND site_id = ? AND organization_id = ? AND (team_id IS NULL OR team_id != ?)`, [
    teamId,
    new Date().toISOString(),
    input.locationId,
    input.siteId,
    input.organizationId,
    teamId,
  ])
  return teamId
}

export async function addUserToResourceTeam(
  _db: DbClient,
  input: { env: CloudflareEnv; userId: string; teamId: string },
): Promise<void> {
  const adapter = await organizationAdapter(input.env)
  await adapter.findOrCreateTeamMember({ teamId: input.teamId, userId: input.userId })
}

export async function removeUserFromResourceTeam(
  _db: DbClient,
  input: { env: CloudflareEnv; userId: string; teamId: string },
): Promise<boolean> {
  const adapter = await organizationAdapter(input.env)
  const existing = await adapter.findTeamMember({ teamId: input.teamId, userId: input.userId })
  if (!existing) return false
  await adapter.removeTeamMember({ teamId: input.teamId, userId: input.userId })
  return true
}

export async function addMemberResourceAccess(
  db: DbClient,
  input: ResourceTeamAccess & { env: CloudflareEnv; userId: string },
): Promise<void> {
  const teamId = input.locationId
    ? await ensureLocationTeam(db, { env: input.env, organizationId: input.organizationId, siteId: input.siteId, locationId: input.locationId })
    : await ensureSiteTeam(db, { env: input.env, organizationId: input.organizationId, siteId: input.siteId })
  await addUserToResourceTeam(db, { env: input.env, userId: input.userId, teamId })
}

export async function removeMemberResourceAccess(
  db: DbClient,
  input: ResourceTeamAccess & { env: CloudflareEnv; userId: string },
): Promise<boolean> {
  const row = input.locationId
    ? await queryFirst<{ team_id: string | null }>(db, `
        SELECT team_id
        FROM business_locations
        WHERE id = ? AND site_id = ? AND organization_id = ?
        LIMIT 1
      `, [input.locationId, input.siteId, input.organizationId])
    : await queryFirst<{ team_id: string | null }>(db, `
        SELECT team_id
        FROM sites
        WHERE id = ? AND organization_id = ?
        LIMIT 1
      `, [input.siteId, input.organizationId])
  if (!row?.team_id) return false
  return await removeUserFromResourceTeam(db, { env: input.env, userId: input.userId, teamId: row.team_id })
}

// Called when a member's role changes away from 'editor' — an editor can
// accumulate site/location team memberships over time (each accepted or
// re-scoped invitation adds one via addMemberResourceAccess), so demoting or
// promoting them to a non-scoped role has to sweep all of them, not just one.
export async function removeAllMemberResourceAccess(
  _db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; userId: string },
): Promise<void> {
  const adapter = await organizationAdapter(input.env)
  const teams = await adapter.listTeamsByUser({ userId: input.userId })
  for (const team of teams) {
    if (team.organizationId !== input.organizationId) continue
    await adapter.removeTeamMember({ teamId: team.id, userId: input.userId })
  }
}

export async function memberHasTeamAccess(db: DbClient, input: { userId: string; teamId: string | null }): Promise<boolean> {
  if (!input.teamId) return false
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM teamMember
    WHERE userId = ? AND teamId = ?
    LIMIT 1
  `, [input.userId, input.teamId])
  return Boolean(row)
}

// Deny-by-default boundary for dashboard handlers that resolve through
// getDashboardContext. Each permitted route below is classified in the #341
// authorization audit and applies its authoritative resource guard or filtered
// query. Site-scoped editor and AI actions use their explicit canonical
// /api/editor/sites/[siteId]/** and /api/ai/[siteId]/** routes instead of
// hiding the site through /api/dashboard aliases.
const SCOPED_ROLE_DASHBOARD_ROUTES = [
  /^\/api\/dashboard\/context$/,
  /^\/api\/dashboard\/home$/,
  /^\/api\/dashboard\/(?:agenda|today)$/,
  /^\/dashboard\/[^/]+\/(?:today|calendar)$/,
  /^\/api\/dashboard\/settings$/,
  /^\/api\/dashboard\/locations(?:\/add|\/[^/]+)?$/,
  /^\/api\/dashboard\/sites\/[^/]+\/guest-threads(?:\/[^/]+(?:\/reply)?)?$/,
  /^\/api\/dashboard\/onboarding-context$/,
  /^\/api\/dashboard\/onboarding\/checklist$/,
  /^\/api\/dashboard\/notifications(?:\/unread-count|\/read-all|\/[^/]+\/read)?$/,
]

export function canScopedRoleUseDashboardPath(pathname: string): boolean {
  const normalizedPath = pathname.split('?', 1)[0] ?? pathname
  return SCOPED_ROLE_DASHBOARD_ROUTES.some(pattern => pattern.test(normalizedPath))
}

export function assertDashboardPathPermission(role: string, pathname: string): void {
  if (isScopedRole(role) && !canScopedRoleUseDashboardPath(pathname)) {
    throw new HTTPError({ statusCode: 403, message: 'This role cannot perform that dashboard action' })
  }
}

export async function listResourceTeamAccess(db: DbClient, memberId: string): Promise<ResourceTeamAccess[]> {
  return await queryAll<ResourceTeamAccess>(db, `
    SELECT s.organization_id AS organizationId, s.id AS siteId, NULL AS locationId
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = s.team_id
    WHERE m.id = ?
    UNION
    SELECT bl.organization_id AS organizationId, bl.site_id AS siteId, bl.id AS locationId
    FROM member m
    JOIN business_locations bl ON bl.organization_id = m.organizationId
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = bl.team_id
    WHERE m.id = ?
  `, [memberId, memberId])
}

export async function resolveDashboardSiteAccess(db: DbClient, input: MemberAccessPrincipal): Promise<DashboardSiteAccess> {
  if (isOrganizationWideRole(input.role)) return 'organization'
  if (!isScopedRole(input.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const siteAccess = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = s.team_id
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.memberId, input.organizationId])
  return siteAccess ? 'site' : 'location'
}

/** Site-wide management access: site settings, blog, localized content, professional-services, analytics, domains, contact-submissions inbox, and any menu/media/review/QA row whose own location_id is null. */
export async function assertSiteWideAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = s.team_id
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.memberId, input.organizationId])
  if (!scope) throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Location management access: org-wide roles, a site-wide-scoped editor, or an editor scoped to this exact location. */
export async function assertLocationAccess(db: DbClient, input: MemberAccessPrincipal & { locationId: string }): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id AND bl.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId IN (s.team_id, bl.team_id)
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.locationId, input.memberId, input.organizationId])
  if (!scope) throw new HTTPError({ statusCode: 404, message: 'Resource not found' })
}

/** A resource that may or may not belong to one location (e.g. a menu/media/review row) — dispatches to assertSiteWideAccess when the row's own location_id is null, assertLocationAccess otherwise. Check the TARGET ROW's location_id, never a caller-supplied param, since the row itself is the source of truth for its own scope. */
export async function assertResourceAccess(db: DbClient, input: MemberAccessPrincipal & { resourceLocationId: string | null }): Promise<void> {
  if (input.resourceLocationId === null) {
    return assertSiteWideAccess(db, input)
  }
  return assertLocationAccess(db, { ...input, locationId: input.resourceLocationId })
}

/** Minimal site-context/discovery access: org-wide roles, or ANY scope row at all for this site — enough to resolve site metadata and navigate to the caller's own location(s). Never grants access to full site settings or other locations' data; callers must still trim their response to what the caller's own scope allows. */
export async function assertSiteContextAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId IN (s.team_id, bl.team_id)
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.memberId, input.organizationId])
  if (!scope) throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Returns null for org-wide roles or site-team editors (unrestricted at this site), or the list of location ids a location-team editor may reach. */
export async function listAccessibleLocationIds(db: DbClient, input: MemberAccessPrincipal): Promise<string[] | null> {
  if (isOrganizationWideRole(input.role)) return null
  if (!isScopedRole(input.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })

  const siteAccess = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = s.team_id
    WHERE m.id = ?
    LIMIT 1
  `, [input.siteId, input.memberId])
  if (siteAccess) return null

  const rows = await queryAll<{ location_id: string }>(db, `
    SELECT bl.id AS location_id
    FROM member m
    JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = bl.team_id
    WHERE m.id = ?
  `, [input.siteId, input.memberId])
  return rows.map(row => row.location_id)
}

export async function assertMemberScope(db: DbClient, input: ResourceScope & { memberId: string; role: string }): Promise<void> {
  if (input.locationId) {
    await assertLocationAccess(db, { ...input, locationId: input.locationId })
    return
  }
  await assertSiteWideAccess(db, input)
}

export async function assertMemberSiteAccess(db: DbClient, input: Omit<ResourceScope, 'locationId'> & { memberId: string; role: string }): Promise<void> {
  await assertSiteContextAccess(db, input)
}

export async function isAuthorizedWhatsAppRecipient(db: DbClient, input: ResourceScope & { phone: string; requireSiteWide?: boolean }): Promise<boolean> {
  const phone = parsePhoneOrThrow(input.phone, { defaultCountry: 'TH' })
  const row = await queryFirst<{ role: string; scopeId: string | null }>(db, `
    SELECT m.role, tm.id AS scopeId
    FROM user u
    JOIN member m ON m.userId = u.id AND m.organizationId = ?
    LEFT JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id AND bl.id = ?
    LEFT JOIN teamMember tm
      ON tm.userId = u.id
      AND tm.teamId = ${input.requireSiteWide ? 's.team_id' : 'COALESCE(bl.team_id, s.team_id)'}
    WHERE u.phoneNumber = ? AND u.phoneNumberVerified = 1
    LIMIT 1
  `, input.requireSiteWide ? [input.organizationId, input.siteId, null, phone] : [input.organizationId, input.siteId, input.locationId ?? null, phone])
  return Boolean(row && (isOrganizationWideRole(row.role) || (isOperationalRole(row.role) && row.scopeId)))
}
