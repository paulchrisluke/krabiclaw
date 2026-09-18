import { HTTPError } from 'nitro';

import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrgAdapter, hasPermission } from 'better-auth/plugins'
import { parsePhoneOrThrow } from '~/utils/phone'
import { oncePerRequest } from '~/server/utils/request-scope'
import type { H3Event } from 'nitro'
import type { CloudflareEnv, organizationOptions } from '~/server/utils/auth'
import type { OrganizationPermissions } from '~/utils/organization-access'

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

/**
 * A membership this request actually resolved: one lookup keyed by
 * (organizationId, userId) that produced all three of these fields together.
 *
 * The brand is what makes that a fact rather than a convention. Only the
 * resolvers in this module mint one, so `organizationId` and `role` cannot
 * come from different places — which is precisely the mistake the scope checks
 * below can no longer catch now that they trust `role` instead of re-reading
 * the member row.
 */
declare const resolvedMembership: unique symbol
export interface ResolvedMembership {
  readonly [resolvedMembership]: true
  readonly userId: string
  readonly organizationId: string
  readonly role: string
}

/** The one place a ResolvedMembership is made. Not exported. */
function resolvedMembershipOf<T extends { userId: string; organizationId: string; role: string }>(fields: T): T & ResolvedMembership {
  return fields as T & ResolvedMembership
}

/**
 * Who is asking, about which site.
 *
 * `userId`, `role` and `organizationId` are not writable by the caller: they
 * are read off a ResolvedMembership, so the scope checks can trust that `role`
 * belongs to `organizationId` without reading the member row back.
 */
export interface MemberAccessPrincipal {
  readonly [resolvedMembership]: true
  readonly env: CloudflareEnv
  // The authenticated user, not the member row id.
  readonly userId: string
  readonly role: string
  readonly organizationId: string
  readonly siteId: string
  // The request this principal was minted for, when there is one. Only used to
  // memoize the team read the scope checks share; absent for scheduled work.
  readonly event?: H3Event
}

export function memberAccessPrincipal(
  membership: ResolvedMembership,
  input: { env: CloudflareEnv; siteId: string; event?: H3Event },
): MemberAccessPrincipal {
  return {
    env: input.env,
    userId: membership.userId,
    role: membership.role,
    organizationId: membership.organizationId,
    siteId: input.siteId,
    event: input.event,
  } as MemberAccessPrincipal
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

/**
 * What a role may do, answered by Better Auth.
 *
 * `utils/organization-access.ts` declares the statements and the four roles,
 * and the plugin is configured with them (`organizationOptions.ac/roles`), so
 * this is the repository's one description of what each role can reach. It used
 * to be reached only by billing; everything else re-decided the same question
 * by hand — `role === 'owner' || role === 'admin'`, an MCP rank ladder, and a
 * list of dashboard route strings, three answers that could drift from the
 * matrix and from each other.
 *
 * `hasPermission` evaluates the role's statements in memory. It reads the
 * database only under `dynamicAccessControl`, which is off here, so this costs
 * no round trip.
 *
 * This answers "may this role do X at all". It does not answer "which sites and
 * locations" — that is team membership against `sites.team_id` /
 * `business_locations.team_id`, which Better Auth does not model, and which
 * assertSiteWideAccess/assertLocationAccess below own.
 */
export type { OrganizationPermissions }

export async function roleAllows(
  input: { organizationId: string; role: string; permissions: OrganizationPermissions },
): Promise<boolean> {
  const { organizationOptions: options } = await import('~/server/utils/auth')
  return await hasPermission({
    organizationId: input.organizationId,
    role: input.role,
    options,
    permissions: input.permissions,
  }, undefined as never)
}

export async function assertRoleAllows(
  input: { organizationId: string; role: string; permissions: OrganizationPermissions; message?: string },
): Promise<void> {
  if (await roleAllows(input)) return
  throw new HTTPError({ statusCode: 403, message: input.message ?? 'Access denied' })
}

export function siteTeamId(siteId: string): string {
  return `site:${siteId}`
}

export function locationTeamId(locationId: string): string {
  return `location:${locationId}`
}

// The adapter has to be built with the same organization options the plugin
// runs with: getOrgAdapter filters organization output through the options'
// additionalFields, so an adapter built with {} silently drops
// deletionScheduledAt and every role/team limit the plugin was configured with.
export type OrganizationAdapter = ReturnType<typeof getOrgAdapter<typeof organizationOptions>>

export async function organizationAdapter(env: CloudflareEnv): Promise<OrganizationAdapter> {
  const { createAuth, organizationOptions: options } = await import('~/server/utils/auth')
  const auth = createAuth(env)
  const context = await auth.$context
  return getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], options)
}

/**
 * The two Better Auth reads every membership resolution is made of, memoized
 * for the life of one request.
 *
 * A dashboard render resolves the same membership twice: getDashboardContext
 * looks the organization up by slug, loadMemberSiteRow looks it up by id, and
 * each then reads the same member row for the same user. Neither can change
 * mid-request. Pass the event and the second resolution is free; without one
 * (scheduled jobs, tenant deletion) they read as before.
 */
function organizationById(env: CloudflareEnv, id: string, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findOrganizationById(id)
  return event ? oncePerRequest(event, `organization:${id}`, read) : read()
}

function organizationBySlug(env: CloudflareEnv, slug: string, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findOrganizationBySlug(slug)
  return event ? oncePerRequest(event, `organization-slug:${slug}`, read) : read()
}

function membershipRow(env: CloudflareEnv, input: { organizationId: string; userId: string }, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findMemberByOrgId(input)
  return event ? oncePerRequest(event, `membership:${input.organizationId}:${input.userId}`, read) : read()
}

export async function resolveOrganizationMembership(
  env: CloudflareEnv,
  input: { organizationId: string; userId: string },
  event?: H3Event,
): Promise<(ResolvedMembership & { memberId: string; organizationSlug: string; organizationName: string; organizationLogo: string | null }) | null> {
  const [member, organization] = await Promise.all([
    membershipRow(env, input, event),
    organizationById(env, input.organizationId, event),
  ])
  if (!member || !organization) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: input.organizationId,
    role: String(member.role),
    memberId: member.id,
    organizationSlug: organization.slug,
    organizationName: organization.name,
    organizationLogo: organization.logo ?? null,
  })
}

/**
 * The membership alone, for a caller that already has an organization id but no
 * proof the asker belongs to it — an SSR data loader reading the id off the
 * rendered payload, an OAuth callback reading it out of its own state.
 *
 * One read. resolveOrganizationMembership and resolveUserOrganization also
 * fetch the organization row for its name and slug; a caller that only needs to
 * authorize does not.
 */
export async function resolveMembership(
  env: CloudflareEnv,
  input: { organizationId: string; userId: string },
): Promise<ResolvedMembership | null> {
  const adapter = await organizationAdapter(env)
  const member = await adapter.findMemberByOrgId(input)
  if (!member) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: input.organizationId,
    role: String(member.role),
  })
}

export async function resolveUserOrganization(
  env: CloudflareEnv,
  input: { userId: string; organizationId?: string | null; organizationSlug?: string | null },
  event?: H3Event,
): Promise<(ResolvedMembership & {
  id: string
  name: string
  slug: string
  logo: string | null
  memberId: string
  deletionScheduledAt: string | null
}) | null> {
  const organization = input.organizationId
    ? await organizationById(env, input.organizationId, event)
    : input.organizationSlug
      ? await organizationBySlug(env, input.organizationSlug, event)
      : null
  if (!organization) return null
  const member = await membershipRow(env, { userId: input.userId, organizationId: organization.id }, event)
  if (!member) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: organization.id,
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo: organization.logo ?? null,
    role: String(member.role),
    memberId: member.id,
    deletionScheduledAt: organization.deletionScheduledAt ? new Date(organization.deletionScheduledAt).toISOString() : null,
  })
}

// adapter.listMembers pages at 100 by default — every caller that needs the
// complete membership (not just a bounded page for display) must walk every
// page via its own total, or a large organization silently loses members
// past the first 100.
async function listAllOrganizationMembers(adapter: OrganizationAdapter, organizationId: string) {
  const pageSize = 100
  const firstPage = await adapter.listMembers({ organizationId, limit: pageSize, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' })
  const members = [...firstPage.members]
  for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
    const page = await adapter.listMembers({ organizationId, limit: pageSize, offset, sortBy: 'createdAt', sortOrder: 'asc' })
    members.push(...page.members)
  }
  return members
}

/**
 * The person internal alerts go to, as an identity rather than just an address.
 *
 * The user id comes back with the email because a notification preference is
 * per person (user_notification_preferences), so the sender needs to know whose
 * preference applies, not only where to post the message.
 */
export async function getOrganizationOwnerRecipient(
  env: CloudflareEnv,
  organizationId: string,
): Promise<{ userId: string; email: string } | null> {
  const adapter = await organizationAdapter(env)
  const members = await listAllOrganizationMembers(adapter, organizationId)
  const owner = members
    .filter(member => member.user && (member.role === 'owner' || member.role === 'admin'))
    .sort((left, right) => {
      const roleOrder = Number(right.role === 'owner') - Number(left.role === 'owner')
      if (roleOrder) return roleOrder
      return Number(left.user.email.endsWith('@example.test')) - Number(right.user.email.endsWith('@example.test'))
    })[0]
  return owner ? { userId: owner.user.id, email: owner.user.email } : null
}

/**
 * The caller's Better Auth teams, memoized for the life of one request.
 *
 * Every scope check for a scoped role reads this same list, and a dashboard
 * render makes several, so without the memo an editor paid one read per
 * assertion. Keyed on the user alone because that is what the adapter query
 * takes; callers filter by organization themselves. Not used by the mutation
 * sweep below, which must see the rows it is deleting.
 */
function teamsByUser(env: CloudflareEnv, userId: string, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).listTeamsByUser({ userId })
  return event ? oncePerRequest(event, `teams:${userId}`, read) : read()
}

export async function listUserOrganizationTeamIds(input: {
  env: CloudflareEnv
  organizationId: string
  userId: string
  event?: H3Event
}): Promise<string[]> {
  const teams = await teamsByUser(input.env, input.userId, input.event)
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
  return await listAllOrganizationMembers(adapter, organizationId)
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

export async function ensureSiteTeam(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; name?: string | null },
): Promise<string> {
  const teamId = siteTeamId(input.siteId)
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

export async function ensureResourceTeams(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId?: string | null; locationId?: string | null },
): Promise<void> {
  if (input.siteId) await ensureSiteTeam(db, { env: input.env, organizationId: input.organizationId, siteId: input.siteId })
  if (input.siteId && input.locationId) {
    await ensureLocationTeam(db, { env: input.env, organizationId: input.organizationId, siteId: input.siteId, locationId: input.locationId })
  }
}

export async function ensureLocationTeam(
  db: DbClient,
  input: { env: CloudflareEnv; organizationId: string; siteId: string; locationId: string; name?: string | null },
): Promise<string> {
  const teamId = locationTeamId(input.locationId)
  await ensureSiteTeam(db, {
    env: input.env,
    organizationId: input.organizationId,
    siteId: input.siteId,
  })
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
const NO_TEAMS: ReadonlySet<string> = new Set<string>()

/**
 * The caller's role and the teams that role is scoped by.
 *
 * `role` comes straight from the principal: it was read from the member row
 * that resolveOrganizationMembership/resolveUserOrganization looked up by
 * (organizationId, userId) for this request, so re-reading the member here
 * would return the same value at the cost of two more D1 round trips (Better
 * Auth's findMemberById reads the member and then its user).
 *
 * Only a scoped role needs anything from the database, and only its teams.
 */
async function canonicalMemberAccess(input: MemberAccessPrincipal): Promise<{
  role: string
  teamIds: ReadonlySet<string>
}> {
  const role = input.role
  if (!isScopedRole(role)) return { role, teamIds: NO_TEAMS }
  const teams = await teamsByUser(input.env, input.userId, input.event)
  return {
    role,
    teamIds: new Set(teams.filter(team => team.organizationId === input.organizationId).map(team => team.id)),
  }
}

export async function listResourceTeamAccess(
  db: DbClient,
  input: { env: CloudflareEnv; userId: string; organizationId: string; event?: H3Event },
): Promise<ResourceTeamAccess[]> {
  const teams = await teamsByUser(input.env, input.userId, input.event)
  const teamIds = new Set(teams.filter(team => team.organizationId === input.organizationId).map(team => team.id))
  if (teamIds.size === 0) return []
  const [sites, locations] = await Promise.all([
    queryAll<ResourceTeamAccess & { team_id: string | null }>(db, `
      SELECT organization_id AS organizationId, id AS siteId, NULL AS locationId, team_id
      FROM sites WHERE organization_id = ?
    `, [input.organizationId]),
    queryAll<ResourceTeamAccess & { team_id: string | null }>(db, `
      SELECT organization_id AS organizationId, site_id AS siteId, id AS locationId, team_id
      FROM business_locations WHERE organization_id = ?
    `, [input.organizationId]),
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

/** Site-wide management access: site settings, blog, localized content, professional-services, analytics, domains, contact-submissions inbox, and any review/QA row whose own location_id is null. */
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

/** A resource that may or may not belong to one location (e.g. a review row) — dispatches to assertSiteWideAccess when the row's own location_id is null, assertLocationAccess otherwise. Check the target row's location_id, never a caller-supplied param. Media authorization uses its placement owner instead. */
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

/**
 * Who, if anyone, may receive a WhatsApp message at this number for this scope.
 *
 * Returns the user id rather than a bare boolean because a notification also
 * has to honour that person's own preference
 * (user_notification_preferences), and resolving the number to an account
 * twice — once to authorize, once to look up the preference — would be two
 * implementations of the same lookup.
 */
export async function resolveAuthorizedWhatsAppRecipient(
  db: DbClient,
  input: ResourceScope & { env: CloudflareEnv; phone: string; requireSiteWide?: boolean },
): Promise<{ userId: string } | null> {
  const { findVerifiedAuthUserByPhone } = await import('~/server/utils/auth')
  const user = await findVerifiedAuthUserByPhone(
    input.env,
    parsePhoneOrThrow(input.phone, { defaultCountry: 'TH' }),
  )
  if (!user) return null
  const membership = await resolveOrganizationMembership(input.env, {
    organizationId: input.organizationId,
    userId: user.id,
  })
  if (!membership || !isOperationalRole(membership.role)) return null
  const recipient = { userId: user.id }
  if (isOrganizationWideRole(membership.role)) return recipient
  const locationIds = await listAccessibleLocationIds(db, memberAccessPrincipal(membership, { env: input.env, siteId: input.siteId }))
  if (input.requireSiteWide || !input.locationId) return locationIds === null ? recipient : null
  return locationIds === null || locationIds.includes(input.locationId) ? recipient : null
}

export async function isAuthorizedWhatsAppRecipient(
  db: DbClient,
  input: ResourceScope & { env: CloudflareEnv; phone: string; requireSiteWide?: boolean },
): Promise<boolean> {
  return (await resolveAuthorizedWhatsAppRecipient(db, input)) !== null
}
