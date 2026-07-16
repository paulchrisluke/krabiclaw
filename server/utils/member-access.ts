import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { normalizePhone } from '~/server/utils/whatsapp'

export const LOCATION_MANAGER_ROLE = 'location_manager' as const

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

export function isOrganizationWideRole(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export function isOperationalRole(role: string): boolean {
  return isOrganizationWideRole(role) || role === 'editor' || role === LOCATION_MANAGER_ROLE
}

export function canAccessResource(role: string, scopes: MemberAccessScope[], resource: ResourceScope): boolean {
  if (isOrganizationWideRole(role)) return true
  if (role !== LOCATION_MANAGER_ROLE) return false

  return scopes.some(scope =>
    scope.organizationId === resource.organizationId
    && scope.siteId === resource.siteId
    && (scope.locationId === null || scope.locationId === (resource.locationId ?? null)),
  )
}

const LOCATION_MANAGER_DASHBOARD_PATHS = [
  '/api/dashboard/context',
  '/api/dashboard/home',
  '/api/dashboard/inbox',
  '/api/dashboard/threads',
  '/api/dashboard/reservations',
  '/api/dashboard/experience-bookings',
  '/api/dashboard/reviews',
  '/api/dashboard/locations',
  '/api/dashboard/location-preference',
  '/api/dashboard/sites',
]

export function canLocationManagerUseDashboardPath(pathname: string): boolean {
  return LOCATION_MANAGER_DASHBOARD_PATHS.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`))
}

export function assertDashboardPathPermission(role: string, pathname: string): void {
  if (role === LOCATION_MANAGER_ROLE && !canLocationManagerUseDashboardPath(pathname)) {
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

export async function assertMemberScope(db: DbClient, input: ResourceScope & { memberId: string; role: string }): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (input.role !== LOCATION_MANAGER_ROLE) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  const scope = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ?
      AND (location_id IS NULL OR location_id = ?)
    LIMIT 1
  `, [input.memberId, input.organizationId, input.siteId, input.locationId ?? null])

  if (!scope) throw createError({ statusCode: 404, message: 'Resource not found' })
}

export async function assertMemberSiteAccess(db: DbClient, input: Omit<ResourceScope, 'locationId'> & { memberId: string; role: string }): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  if (input.role !== LOCATION_MANAGER_ROLE) throw createError({ statusCode: 403, message: 'Access denied' })
  const scope = await queryFirst<{ id: string }>(db, `
    SELECT id FROM member_access_scope
    WHERE member_id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [input.memberId, input.organizationId, input.siteId])
  if (!scope) throw createError({ statusCode: 404, message: 'Site not found' })
}

export async function isAuthorizedWhatsAppRecipient(db: DbClient, input: ResourceScope & { phone: string; requireSiteWide?: boolean }): Promise<boolean> {
  const phone = normalizePhone(input.phone)
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
