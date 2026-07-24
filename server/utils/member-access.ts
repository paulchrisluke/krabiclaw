import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { parsePhoneOrThrow } from '~/utils/phone'

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
  memberId: string
  role: string
  organizationId: string
  siteId: string
}

export type DashboardSiteAccess = 'organization' | 'site' | 'location'

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
    throw createError({ statusCode: 403, message: 'Organization-level access required' })
  }
}

export function siteTeamId(siteId: string): string {
  return `site:${siteId}`
}

export function locationTeamId(locationId: string): string {
  return `location:${locationId}`
}

function teamMembershipKey(teamId: string, userId: string): string {
  return `${teamId}:${userId}`
}

export async function ensureSiteTeam(db: DbClient, input: { organizationId: string; siteId: string; name?: string | null }): Promise<string> {
  const teamId = siteTeamId(input.siteId)
  const now = Math.floor(Date.now() / 1000)
  await execute(db, `
    INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
    VALUES (?, ?, ?, ?)
  `, [teamId, input.name?.trim() || `Site ${input.siteId}`, input.organizationId, now])
  await execute(db, `UPDATE sites SET team_id = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND (team_id IS NULL OR team_id != ?)`, [
    teamId,
    new Date().toISOString(),
    input.siteId,
    input.organizationId,
    teamId,
  ])
  return teamId
}

export async function ensureLocationTeam(db: DbClient, input: { organizationId: string; siteId: string; locationId: string; name?: string | null }): Promise<string> {
  const teamId = locationTeamId(input.locationId)
  const now = Math.floor(Date.now() / 1000)
  await ensureSiteTeam(db, { organizationId: input.organizationId, siteId: input.siteId })
  await execute(db, `
    INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
    VALUES (?, ?, ?, ?)
  `, [teamId, input.name?.trim() || `Location ${input.locationId}`, input.organizationId, now])
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

export async function ensureResourceTeams(db: DbClient, input: { organizationId: string; siteId?: string | null; locationId?: string | null }): Promise<void> {
  if (input.siteId) await ensureSiteTeam(db, { organizationId: input.organizationId, siteId: input.siteId })
  if (input.siteId && input.locationId) {
    await ensureLocationTeam(db, { organizationId: input.organizationId, siteId: input.siteId, locationId: input.locationId })
  }
}

export async function addUserToResourceTeam(db: DbClient, input: { userId: string; teamId: string }): Promise<void> {
  await execute(db, `
    INSERT OR IGNORE INTO teamMember (id, teamId, userId, membershipKey, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), input.teamId, input.userId, teamMembershipKey(input.teamId, input.userId), Math.floor(Date.now() / 1000)])
}

export async function removeUserFromResourceTeam(db: DbClient, input: { userId: string; teamId: string }): Promise<boolean> {
  const result = await execute(db, `DELETE FROM teamMember WHERE teamId = ? AND userId = ?`, [input.teamId, input.userId])
  return (result.meta?.changes ?? 0) > 0
}

export async function addMemberResourceAccess(db: DbClient, input: ResourceTeamAccess & { userId: string }): Promise<void> {
  const teamId = input.locationId
    ? await ensureLocationTeam(db, { organizationId: input.organizationId, siteId: input.siteId, locationId: input.locationId })
    : await ensureSiteTeam(db, { organizationId: input.organizationId, siteId: input.siteId })
  await addUserToResourceTeam(db, { userId: input.userId, teamId })
}

export async function removeMemberResourceAccess(db: DbClient, input: ResourceTeamAccess & { userId: string }): Promise<boolean> {
  const teamId = input.locationId ? locationTeamId(input.locationId) : siteTeamId(input.siteId)
  return await removeUserFromResourceTeam(db, { userId: input.userId, teamId })
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
  /^\/api\/dashboard\/settings$/,
  /^\/api\/dashboard\/locations(?:\/add|\/[^/]+)?$/,
  /^\/api\/dashboard\/sites\/[^/]+\/guest-threads(?:\/[^/]+(?:\/reply)?)?$/,
  /^\/api\/dashboard\/onboarding\/checklist$/,
  /^\/api\/dashboard\/notifications(?:\/unread-count|\/read-all|\/[^/]+\/read)?$/,
]

export function canScopedRoleUseDashboardPath(pathname: string): boolean {
  const normalizedPath = pathname.split('?', 1)[0] ?? pathname
  return SCOPED_ROLE_DASHBOARD_ROUTES.some(pattern => pattern.test(normalizedPath))
}

export function assertDashboardPathPermission(role: string, pathname: string): void {
  if (isScopedRole(role) && !canScopedRoleUseDashboardPath(pathname)) {
    throw createError({ statusCode: 403, message: 'This role cannot perform that dashboard action' })
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
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })
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

/** Site-wide management access: site settings, blog, translations, professional-services, analytics, domains, contact-submissions inbox, and any menu/media/review/QA row whose own location_id is null. */
export async function assertSiteWideAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId = s.team_id
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.memberId, input.organizationId])
  if (!scope) throw createError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Location management access: org-wide roles, a site-wide-scoped editor, or an editor scoped to this exact location. */
export async function assertLocationAccess(db: DbClient, input: MemberAccessPrincipal & { locationId: string }): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id AND bl.id = ?
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId IN (s.team_id, bl.team_id)
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.locationId, input.memberId, input.organizationId])
  if (!scope) throw createError({ statusCode: 404, message: 'Resource not found' })
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
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT tm.id
    FROM member m
    JOIN sites s ON s.organization_id = m.organizationId AND s.id = ?
    LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id
    JOIN teamMember tm ON tm.userId = m.userId AND tm.teamId IN (s.team_id, bl.team_id)
    WHERE m.id = ? AND m.organizationId = ?
    LIMIT 1
  `, [input.siteId, input.memberId, input.organizationId])
  if (!scope) throw createError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Returns null for org-wide roles or site-team editors (unrestricted at this site), or the list of location ids a location-team editor may reach. */
export async function listAccessibleLocationIds(db: DbClient, input: MemberAccessPrincipal): Promise<string[] | null> {
  if (isOrganizationWideRole(input.role)) return null
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

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
