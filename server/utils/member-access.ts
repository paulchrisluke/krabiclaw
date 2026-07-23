import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { parsePhoneOrThrow } from '~/utils/phone'

// #341 Workstream A: location_manager is retired as a distinct role. There
// are now exactly two role tiers:
//   - owner / admin: organization-wide, bypasses member_access_scope entirely.
//   - editor: ALWAYS constrained through member_access_scope. A site-wide
//     scope row (location_id IS NULL) makes an editor a "site manager" for
//     that site; a scope row with location_id set makes them a "location
//     manager" for that location only. An editor can hold multiple scope
//     rows across sites/locations. There is no role-name distinction between
//     "site manager" and "location manager" — it's the same role, editor,
//     described entirely by which scope rows they hold.
//
// This file intentionally exposes FOUR different access-check functions
// rather than one generic "does this member have any access to this site"
// helper. Collapsing them into one would let a location-scoped editor reach
// site-wide managers and settings the moment they can enter the site at all,
// which is exactly what must not happen (see #341 Workstream A requirements):
//   - assertOrganizationAccess: owner/admin only.
//   - assertSiteWideAccess: org-wide roles, or an editor with a location_id
//     IS NULL scope row for this site. Use for site settings, blog, site-wide
//     media/QA/reviews (when the target row itself has no location_id), the
//     contact-submissions inbox, translations, professional-services,
//     analytics, domains.
//   - assertLocationAccess: org-wide roles, an editor with a site-wide scope
//     row, OR an editor with a scope row for this exact location. Use for any
//     resource that is genuinely owned by one location (menus/media/reviews
//     rows that have a location_id set, experiences, bookings, location QA).
//   - assertSiteContextAccess: org-wide roles, or ANY scope row at all for
//     this site (site-wide or a specific location) — enough to resolve site
//     metadata and the caller's own accessible location(s) to navigate into,
//     never full site settings or other locations' data.

export interface MemberAccessScope {
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

// The only non-org-wide role left. Kept as a named predicate (rather than
// inlining `role === 'editor'` everywhere) so a future additional scoped role
// doesn't require touching every call site — see the retired
// isOperationalRole/LOCATION_MANAGER_ROLE this replaced.
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

// Deny-by-default boundary for dashboard handlers that resolve through
// getDashboardContext. Each permitted route below is classified in the #341
// authorization audit and applies its authoritative resource guard or filtered
// query. The editor/AI proxy namespaces delegate to the already-audited
// /api/editor/sites/[siteId]/** and selected /api/ai/[siteId]/** handlers.
const SCOPED_ROLE_DASHBOARD_ROUTES = [
  /^\/api\/dashboard\/context$/,
  /^\/api\/dashboard\/home$/,
  /^\/api\/dashboard\/settings$/,
  /^\/api\/dashboard\/locations(?:\/add|\/[^/]+(?:\/integrations\/google-business(?:\/auth)?)?)?$/,
  /^\/api\/dashboard\/onboarding\/checklist$/,
  /^\/api\/dashboard\/notifications(?:\/unread-count|\/read-all|\/[^/]+\/read)?$/,
  /^\/api\/dashboard\/editor(?:\/.*)?$/,
  /^\/api\/dashboard\/ai\/(?:agent|conversations(?:\/.*)?|credits|enhance-prompt|generate-image|menu\/extract|posts\/generate)$/,
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

export async function listMemberAccessScopes(db: DbClient, memberId: string): Promise<MemberAccessScope[]> {
  return await queryAll<MemberAccessScope>(db, `
    SELECT organization_id AS organizationId, site_id AS siteId, location_id AS locationId
    FROM member_access_scope
    WHERE member_id = ?
  `, [memberId])
}

export async function resolveDashboardSiteAccess(db: DbClient, input: MemberAccessPrincipal): Promise<DashboardSiteAccess> {
  if (isOrganizationWideRole(input.role)) return 'organization'
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })
  const scope = await queryFirst<{ site_wide: number }>(db, `
    SELECT MAX(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) AS site_wide
    FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ?
  `, [input.memberId, input.organizationId, input.siteId])
  return scope?.site_wide ? 'site' : 'location'
}

/** Site-wide management access: site settings, blog, translations, professional-services, analytics, domains, contact-submissions inbox, and any menu/media/review/QA row whose own location_id is null. */
export async function assertSiteWideAccess(db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT id FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL
    LIMIT 1
  `, [input.memberId, input.organizationId, input.siteId])
  if (!scope) throw createError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Location management access: org-wide roles, a site-wide-scoped editor, or an editor scoped to this exact location. */
export async function assertLocationAccess(db: DbClient, input: MemberAccessPrincipal & { locationId: string }): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT id FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ?
      AND (location_id IS NULL OR location_id = ?)
    LIMIT 1
  `, [input.memberId, input.organizationId, input.siteId, input.locationId])
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
    SELECT id FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [input.memberId, input.organizationId, input.siteId])
  if (!scope) throw createError({ statusCode: 404, message: 'Site not found or access denied' })
}

/** Returns null for org-wide roles (unrestricted — every location), or the list of location ids a scoped editor may reach at this site. An empty array means the editor has scope rows for this site but none apply here (defensive; should not normally happen for a site-wide-scoped editor, since that case returns null via the site-wide row's own listing being irrelevant to a location filter). */
export async function listAccessibleLocationIds(db: DbClient, input: MemberAccessPrincipal): Promise<string[] | null> {
  if (isOrganizationWideRole(input.role)) return null
  if (!isScopedRole(input.role)) throw createError({ statusCode: 403, message: 'Access denied' })

  const rows = await queryAll<{ location_id: string | null }>(db, `
    SELECT location_id FROM member_access_scope WHERE member_id = ? AND site_id = ?
  `, [input.memberId, input.siteId])
  if (rows.some(row => row.location_id === null)) return null
  return rows.map(row => row.location_id).filter((id): id is string => Boolean(id))
}

// Backward-compatible aliases retained during the migration window this
// commit series lands in. Both now route through the same site-wide-or-exact
// -location check that assertLocationAccess implements — the distinction
// this file used to make between "editor" (org-wide) and "location_manager"
// (scope-checked) no longer exists; every non-org-wide role is scope-checked
// the same way.
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
  const siteWideClause = input.requireSiteWide
    ? 'mas.location_id IS NULL'
    : '(mas.location_id IS NULL OR mas.location_id = ?)'
  const params = input.requireSiteWide
    ? [input.organizationId, input.siteId, phone]
    : [input.organizationId, input.siteId, input.locationId ?? null, phone]
  const row = await queryFirst<{ role: string; scopeId: string | null }>(db, `
    SELECT m.role, mas.id AS scopeId
    FROM user u
    JOIN member m ON m.userId = u.id AND m.organizationId = ?
    LEFT JOIN member_access_scope mas
      ON mas.member_id = m.id AND mas.organization_id = m.organizationId AND mas.site_id = ?
      AND ${siteWideClause}
    WHERE u.phoneNumber = ? AND u.phoneNumberVerified = 1
    LIMIT 1
  `, params)
  return Boolean(row && (isOrganizationWideRole(row.role) || (isOperationalRole(row.role) && row.scopeId)))
}
