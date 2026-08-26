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
  env: CloudflareEnv
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

export async function resolveOrganizationMembership(
  env: CloudflareEnv,
  input: { organizationId: string; userId: string },
): Promise<{ memberId: string; role: string; organizationSlug: string; organizationName: string; organizationLogo: string | null } | null> {
  const adapter = await organizationAdapter(env)
  const [member, organization] = await Promise.all([
    adapter.findMemberByOrgId(input),
    adapter.findOrganizationById(input.organizationId),
  ])
  if (!member || !organization) return null
  return {
    memberId: member.id,
    role: String(member.role),
    organizationSlug: organization.slug,
    organizationName: organization.name,
    organizationLogo: organization.logo ?? null,
  }
}

export async function resolveUserOrganization(
  env: CloudflareEnv,
  input: { userId: string; organizationId?: string | null; organizationSlug?: string | null },
): Promise<{
  id: string
  name: string
  slug: string
  logo: string | null
  role: string
  memberId: string
} | null> {
  const adapter = await organizationAdapter(env)
  const organization = input.organizationId
    ? await adapter.findOrganizationById(input.organizationId)
    : input.organizationSlug
      ? await adapter.findOrganizationBySlug(input.organizationSlug)
      : null
  if (!organization) return null
  const member = await adapter.findMemberByOrgId({
    userId: input.userId,
    organizationId: organization.id,
  })
  if (!member) return null
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo: organization.logo ?? null,
    role: String(member.role),
    memberId: member.id,
  }
}

export async function getOrganizationOwnerEmail(env: CloudflareEnv, organizationId: string): Promise<string | null> {
  const adapter = await organizationAdapter(env)
  const { members } = await adapter.listMembers({
    organizationId,
    limit: 100,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'asc',
  })
  return members
    .filter(member => member.role === 'owner' || member.role === 'admin')
    .sort((left, right) => {
      const roleOrder = Number(right.role === 'owner') - Number(left.role === 'owner')
      if (roleOrder) return roleOrder
      return Number(left.user.email.endsWith('@example.test')) - Number(right.user.email.endsWith('@example.test'))
    })[0]?.user.email ?? null
}

export async function listUserOrganizationTeamIds(input: {
  env: CloudflareEnv
  organizationId: string
  userId: string
}): Promise<string[]> {
  const adapter = await organizationAdapter(input.env)
  const teams = await adapter.listTeamsByUser({ userId: input.userId })
  return teams.filter(team => team.organizationId === input.organizationId).map(team => team.id)
}

export async function listUserOrganizations(env: CloudflareEnv, userId: string) {
  const adapter = await organizationAdapter(env)
  return await adapter.listOrganizations(userId)
}

export async function findOrganizationMemberById(
  env: CloudflareEnv,
  memberId: string,
): Promise<{ id: string; userId: string; organizationId: string; role: string } | null> {
  const adapter = await organizationAdapter(env)
  const member = await adapter.findMemberById(memberId)
  if (!member) return null
  return {
    id: member.id,
    userId: member.userId,
    organizationId: member.organizationId,
    role: String(member.role),
  }
}

export async function findOrganizationById(env: CloudflareEnv, organizationId: string) {
  return await organizationAdapter(env).then(adapter => adapter.findOrganizationById(organizationId))
}

export async function listOrganizationMembers(env: CloudflareEnv, organizationId: string) {
  const adapter = await organizationAdapter(env)
  const { members } = await adapter.listMembers({
    organizationId,
    limit: 100,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'asc',
  })
  return members
}

export async function deleteOrganization(env: CloudflareEnv, organizationId: string): Promise<void> {
  await organizationAdapter(env).then(adapter => adapter.deleteOrganization(organizationId))
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

export async function memberHasTeamAccess(_db: DbClient, input: { env: CloudflareEnv; userId: string; teamId: string | null }): Promise<boolean> {
  if (!input.teamId) return false
  const adapter = await organizationAdapter(input.env)
  return Boolean(await adapter.findTeamMember({ userId: input.userId, teamId: input.teamId }))
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

async function canonicalMemberAccess(input: MemberAccessPrincipal): Promise<{
  role: string
  userId: string
  teamIds: Set<string>
}> {
  const adapter = await organizationAdapter(input.env)
  const member = await adapter.findMemberById(input.memberId)
  if (!member || member.organizationId !== input.organizationId) {
    throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  }
  const role = String(member.role)
  const teams = isScopedRole(role)
    ? await adapter.listTeamsByUser({ userId: member.userId })
    : []
  return {
    role,
    userId: member.userId,
    teamIds: new Set(teams.filter(team => team.organizationId === input.organizationId).map(team => team.id)),
  }
}

export async function listResourceTeamAccess(
  db: DbClient,
  input: { env: CloudflareEnv; memberId: string },
): Promise<ResourceTeamAccess[]> {
  const adapter = await organizationAdapter(input.env)
  const member = await adapter.findMemberById(input.memberId)
  if (!member) return []
  const teams = await adapter.listTeamsByUser({ userId: member.userId })
  const teamIds = new Set(teams.filter(team => team.organizationId === member.organizationId).map(team => team.id))
  if (teamIds.size === 0) return []
  const [sites, locations] = await Promise.all([
    queryAll<ResourceTeamAccess & { team_id: string | null }>(db, `
      SELECT organization_id AS organizationId, id AS siteId, NULL AS locationId, team_id
      FROM sites WHERE organization_id = ?
    `, [member.organizationId]),
    queryAll<ResourceTeamAccess & { team_id: string | null }>(db, `
      SELECT organization_id AS organizationId, site_id AS siteId, id AS locationId, team_id
      FROM business_locations WHERE organization_id = ?
    `, [member.organizationId]),
  ])
  return [...sites, ...locations]
    .filter(row => row.team_id && teamIds.has(row.team_id))
    .map(({ organizationId, siteId, locationId }) => ({ organizationId, siteId, locationId }))
}

export async function resolveDashboardSiteAccess(db: DbClient, input: MemberAccessPrincipal): Promise<DashboardSiteAccess> {
  const access = await canonicalMemberAccess(input)
  if (isOrganizationWideRole(access.role)) return 'organization'
  if (!isScopedRole(access.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const site = await queryFirst<{ team_id: string | null }>(db, `
    SELECT team_id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [input.siteId, input.organizationId])
  return site?.team_id && access.teamIds.has(site.team_id) ? 'site' : 'location'
}

/** Site-wide management access: site settings, blog, localized content, professional-services, analytics, domains, contact-submissions inbox, and any menu/review/QA row whose own location_id is null. */
export async function assertSiteWideAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  const access = await canonicalMemberAccess(input)
  if (isOrganizationWideRole(access.role)) return
  if (!isScopedRole(access.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const site = await queryFirst<{ team_id: string | null }>(db, `
    SELECT team_id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [input.siteId, input.organizationId])
  if (!site?.team_id || !access.teamIds.has(site.team_id)) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
  }
}

/** Location management access: org-wide roles, a site-wide-scoped editor, or an editor scoped to this exact location. */
export async function assertLocationAccess(db: DbClient, input: MemberAccessPrincipal & { locationId: string }): Promise<void> {
  const access = await canonicalMemberAccess(input)
  if (isOrganizationWideRole(access.role)) return
  if (!isScopedRole(access.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const scope = await queryFirst<{ site_team_id: string | null; location_team_id: string | null }>(db, `
    SELECT s.team_id AS site_team_id, bl.team_id AS location_team_id
    FROM sites s
    LEFT JOIN business_locations bl
      ON bl.organization_id = s.organization_id AND bl.site_id = s.id AND bl.id = ?
    WHERE s.id = ? AND s.organization_id = ?
    LIMIT 1
  `, [input.locationId, input.siteId, input.organizationId])
  if (!scope || ![scope.site_team_id, scope.location_team_id].some(teamId => teamId && access.teamIds.has(teamId))) {
    throw new HTTPError({ statusCode: 404, message: 'Resource not found' })
  }
}

/** A resource that may or may not belong to one location (e.g. a menu or review row) — dispatches to assertSiteWideAccess when the row's own location_id is null, assertLocationAccess otherwise. Check the target row's location_id, never a caller-supplied param. Media authorization uses its placement owner instead. */
export async function assertResourceAccess(db: DbClient, input: MemberAccessPrincipal & { resourceLocationId: string | null }): Promise<void> {
  if (input.resourceLocationId === null) {
    return assertSiteWideAccess(db, input)
  }
  return assertLocationAccess(db, { ...input, locationId: input.resourceLocationId })
}

/** Minimal site-context/discovery access: org-wide roles, or ANY scope row at all for this site — enough to resolve site metadata and navigate to the caller's own location(s). Never grants access to full site settings or other locations' data; callers must still trim their response to what the caller's own scope allows. */
export async function assertSiteContextAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  const access = await canonicalMemberAccess(input)
  if (isOrganizationWideRole(access.role)) return
  if (!isScopedRole(access.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const rows = await queryAll<{ team_id: string | null }>(db, `
    SELECT team_id FROM sites WHERE id = ? AND organization_id = ?
    UNION ALL
    SELECT team_id FROM business_locations WHERE site_id = ? AND organization_id = ?
  `, [input.siteId, input.organizationId, input.siteId, input.organizationId])
  if (!rows.some(row => row.team_id && access.teamIds.has(row.team_id))) {
    throw new HTTPError({ statusCode: 404, message: 'Site not found or access denied' })
  }
}

/** Returns null for org-wide roles or site-team editors (unrestricted at this site), or the list of location ids a location-team editor may reach. */
export async function listAccessibleLocationIds(db: DbClient, input: MemberAccessPrincipal): Promise<string[] | null> {
  const access = await canonicalMemberAccess(input)
  if (isOrganizationWideRole(access.role)) return null
  if (!isScopedRole(access.role)) throw new HTTPError({ statusCode: 403, message: 'Access denied' })
  const site = await queryFirst<{ team_id: string | null }>(db, `
    SELECT team_id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [input.siteId, input.organizationId])
  if (site?.team_id && access.teamIds.has(site.team_id)) return null
  const rows = await queryAll<{ location_id: string; team_id: string | null }>(db, `
    SELECT id AS location_id, team_id FROM business_locations
    WHERE site_id = ? AND organization_id = ?
  `, [input.siteId, input.organizationId])
  return rows.filter(row => row.team_id && access.teamIds.has(row.team_id)).map(row => row.location_id)
}

export async function assertMemberScope(db: DbClient, input: MemberAccessPrincipal & { locationId?: string | null }): Promise<void> {
  if (input.locationId) {
    await assertLocationAccess(db, { ...input, locationId: input.locationId })
    return
  }
  await assertSiteWideAccess(db, input)
}

export async function assertMemberSiteAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  await assertSiteContextAccess(db, input)
}

export async function isAuthorizedWhatsAppRecipient(
  db: DbClient,
  input: ResourceScope & { env: CloudflareEnv; phone: string; requireSiteWide?: boolean },
): Promise<boolean> {
  const { findVerifiedAuthUserByPhone } = await import('~/server/utils/auth')
  const user = await findVerifiedAuthUserByPhone(
    input.env,
    parsePhoneOrThrow(input.phone, { defaultCountry: 'TH' }),
  )
  if (!user) return false
  const membership = await resolveOrganizationMembership(input.env, {
    organizationId: input.organizationId,
    userId: user.id,
  })
  if (!membership || !isOperationalRole(membership.role)) return false
  if (isOrganizationWideRole(membership.role)) return true
  const locationIds = await listAccessibleLocationIds(db, {
    env: input.env,
    memberId: membership.memberId,
    role: membership.role,
    organizationId: input.organizationId,
    siteId: input.siteId,
  })
  if (input.requireSiteWide || !input.locationId) return locationIds === null
  return locationIds === null || locationIds.includes(input.locationId)
}
