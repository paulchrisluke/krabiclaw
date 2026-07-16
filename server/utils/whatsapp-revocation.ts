// Configuration-led and member-led WhatsApp access revocation (issue #293
// Sections G and H).
//
// G — clearing/replacing a location's `notification_phone` or a site's
// `site_config['whatsapp_phone']` must remove only the recipient's scope for
// that exact site/location, and a `location_manager` left with zero scopes
// anywhere in the org must have their organization membership removed.
//
// H — removing a `location_manager` directly must first surface (and let the
// caller clear) any notification assignments still pointing at their verified
// phone, so removal can't leave a stale config pointer that would silently
// re-invite them the next time that config is saved (see
// `ensureWhatsAppRecipientAccess`'s "reuse existing member" branch, which is
// keyed on `user.phoneNumber` + `user.phoneNumberVerified`, not membership).
//
// Owner/admin/editor memberships are never touched by anything in this file —
// every removal path here is gated on `role === LOCATION_MANAGER_ROLE`
// specifically (not just "not organization-wide", since `editor` is
// operational-but-not-org-wide and must also be excluded).
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { LOCATION_MANAGER_ROLE, listMemberAccessScopes } from '~/server/utils/member-access'
import { fireSiteEventSafe, resolvePrimarySiteForEvent } from '~/server/utils/site-events'
import type { createAuth } from '~/server/utils/auth'

type AuthInstance = ReturnType<typeof createAuth>

interface RemoveMemberApi {
  removeMember(_input: {
    body: { memberIdOrEmail: string; organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export interface RemoveMembershipResult {
  removed: boolean
}

/**
 * If `memberId` is a `location_manager` with zero remaining
 * `member_access_scope` rows anywhere in the org, removes their organization
 * membership. No-op (and returns `{ removed: false }`) for any other role,
 * for a member with remaining scopes, or for an unknown member id.
 *
 * Prefers Better Auth's own `/organization/remove-member` API (via
 * `actorHeaders` — the acting owner/admin's real request headers) so the
 * existing `member.delete.after` audit hook fires naturally. That endpoint
 * requires a permission-checked session (`requireHeaders: true` +
 * `orgSessionMiddleware`), which isn't available for system/MCP-triggered
 * cleanup with no interactive request behind it — in that case (or if the API
 * call itself fails) this falls back to deleting the `member` row directly
 * (the same direct-SQL pattern already used against Better Auth-owned tables
 * elsewhere in this codebase, e.g. `invitation`/`invitation_access_scope` in
 * `server/utils/whatsapp-access.ts`) and fires the equivalent `member.removed`
 * audit event itself so the audit trail stays equivalent either way.
 *
 * Never deletes the underlying Better Auth `user` row — only the org
 * membership (`member` row).
 */
export async function removeOrgMembershipIfNoScopesRemain(
  db: DbClient,
  auth: AuthInstance | null,
  memberId: string,
  options?: { actorHeaders?: HeadersInit },
): Promise<RemoveMembershipResult> {
  const member = await queryFirst<{ id: string; organizationId: string; role: string; userId: string }>(db, `
    SELECT id, organizationId, role, userId FROM member WHERE id = ? LIMIT 1
  `, [memberId])
  if (!member) return { removed: false }

  // Guard explicitly by role equality — owner/admin (org-wide) and editor
  // (operational-but-not-org-wide) must never be auto-removed or downgraded.
  if (member.role !== LOCATION_MANAGER_ROLE) return { removed: false }

  const scopes = await listMemberAccessScopes(db, memberId)
  if (scopes.length > 0) return { removed: false }

  if (auth && options?.actorHeaders) {
    try {
      const removeApi = auth.api as unknown as RemoveMemberApi
      const response = await removeApi.removeMember({
        body: { memberIdOrEmail: member.id, organizationId: member.organizationId },
        headers: options.actorHeaders,
        asResponse: true,
      })
      if (response.ok) return { removed: true }
      console.warn('whatsapp_revocation_remove_member_via_api_rejected', { memberId, status: response.status })
    } catch (error) {
      console.warn('whatsapp_revocation_remove_member_via_api_failed', {
        memberId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    // Fall through to the direct-removal path below so a scope-less
    // location_manager is never left dangling just because the API call
    // hiccuped (e.g. the acting session expired mid-request).
  }

  await execute(db, `DELETE FROM member WHERE id = ?`, [memberId])
  const siteId = await resolvePrimarySiteForEvent(db, member.organizationId)
  if (siteId) {
    await fireSiteEventSafe({
      db,
      organizationId: member.organizationId,
      siteId,
      eventType: 'member.removed',
      entityType: 'member',
      entityId: memberId,
      metadata: { userId: member.userId, reason: 'no_remaining_whatsapp_scopes' },
    })
  }
  return { removed: true }
}

export interface PhoneChangeParams {
  organizationId: string
  siteId: string
  /** Required when `scopeType === 'location'`; ignored for `'site'`. */
  locationId?: string | null
  scopeType: 'location' | 'site'
  previousPhone: string | null
  newPhone: string | null
  /** The acting owner/admin's real request headers, when available — see `removeOrgMembershipIfNoScopesRemain`. */
  actorHeaders?: HeadersInit
}

export interface PhoneChangeResult {
  scopeRemoved: boolean
  memberRemoved: boolean
}

/**
 * Call on every write to `business_locations.notification_phone` or
 * `site_config['whatsapp_phone']` where the phone value actually changed.
 * Removes only the recipient's `member_access_scope` row for this exact
 * site/location — other scope rows for the same member (other sites/
 * locations, even ones that still list the same phone number) are untouched
 * by construction, since the DELETE below is always scoped to the single
 * `(site_id, location_id)` pair this config write is for. That's the whole
 * "recalculation": a shared number configured at N places has N independent
 * scope rows, and clearing one config slot only ever removes the one scope
 * row tied to that slot.
 *
 * A no-op (idempotent) when `previousPhone` is empty or unchanged — re-saving
 * the same number must not re-trigger removal/audit events.
 */
export async function recalculateScopesForPhoneChange(
  db: DbClient,
  auth: AuthInstance | null,
  params: PhoneChangeParams,
): Promise<PhoneChangeResult> {
  const { organizationId, siteId, scopeType, previousPhone, newPhone, actorHeaders } = params
  const locationId = scopeType === 'location' ? (params.locationId ?? null) : null

  if (!previousPhone || previousPhone === newPhone) {
    return { scopeRemoved: false, memberRemoved: false }
  }

  const holder = await queryFirst<{ memberId: string; role: string }>(db, `
    SELECT m.id AS memberId, m.role
    FROM user u
    JOIN member m ON m.userId = u.id AND m.organizationId = ?
    WHERE u.phoneNumber = ? AND u.phoneNumberVerified = 1
    LIMIT 1
  `, [organizationId, previousPhone])
  if (!holder) return { scopeRemoved: false, memberRemoved: false }

  // Owner/admin/editor never lose access from a config change — only a
  // location_manager's scope is config-derived in the first place.
  if (holder.role !== LOCATION_MANAGER_ROLE) return { scopeRemoved: false, memberRemoved: false }

  const deleteResult = scopeType === 'location'
    ? await execute(db, `
        DELETE FROM member_access_scope
        WHERE member_id = ? AND organization_id = ? AND site_id = ? AND location_id = ?
      `, [holder.memberId, organizationId, siteId, locationId])
    : await execute(db, `
        DELETE FROM member_access_scope
        WHERE member_id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL
      `, [holder.memberId, organizationId, siteId])

  const scopeRemoved = (deleteResult.meta?.changes ?? 0) > 0
  if (!scopeRemoved) return { scopeRemoved: false, memberRemoved: false }

  await fireSiteEventSafe({
    db,
    organizationId,
    siteId,
    locationId,
    eventType: 'member.access_scope_revoked',
    entityType: 'member',
    entityId: holder.memberId,
    metadata: { reason: 'notification_phone_changed', scopeType, previousPhone, newPhone: newPhone ?? null },
  })

  const removal = await removeOrgMembershipIfNoScopesRemain(db, auth, holder.memberId, { actorHeaders })
  return { scopeRemoved: true, memberRemoved: removal.removed }
}

export interface PhoneAssignment {
  kind: 'location' | 'site'
  organizationId: string
  siteId: string
  siteName: string | null
  locationId: string | null
  locationName: string | null
}

/**
 * Finds every `business_locations.notification_phone` / `site_config`
 * (`whatsapp_phone`) row that currently points at `memberId`'s verified
 * phone number — the set of assignments that would go stale (and could
 * silently re-invite this person later) if their membership were removed
 * without clearing them first. Returns `[]` for a member with no verified
 * phone, matching `isAuthorizedWhatsAppRecipient`'s own verified-phone gate.
 */
export async function findAssignmentsForMemberPhone(db: DbClient, memberId: string): Promise<PhoneAssignment[]> {
  const member = await queryFirst<{ userId: string; organizationId: string }>(db, `SELECT userId, organizationId FROM member WHERE id = ? LIMIT 1`, [memberId])
  if (!member) return []

  const user = await queryFirst<{ phoneNumber: string | null; phoneNumberVerified: number }>(db, `
    SELECT phoneNumber, phoneNumberVerified FROM user WHERE id = ? LIMIT 1
  `, [member.userId])
  if (!user?.phoneNumber || !user.phoneNumberVerified) return []
  const phone = user.phoneNumber

  const locationRows = await queryAll<{
    organizationId: string; siteId: string; siteName: string | null; locationId: string; locationName: string
  }>(db, `
    SELECT bl.organization_id AS organizationId, bl.site_id AS siteId,
           coalesce(s.brand_name, o.name) AS siteName, bl.id AS locationId, bl.title AS locationName
    FROM business_locations bl
    JOIN sites s ON s.id = bl.site_id
    JOIN organization o ON o.id = bl.organization_id
    WHERE bl.notification_phone = ? AND bl.organization_id = ?
  `, [phone, member.organizationId])

  const siteRows = await queryAll<{
    organizationId: string; siteId: string; siteName: string | null
  }>(db, `
    SELECT sc.organization_id AS organizationId, sc.site_id AS siteId, coalesce(s.brand_name, o.name) AS siteName
    FROM site_config sc
    JOIN sites s ON s.id = sc.site_id
    JOIN organization o ON o.id = sc.organization_id
    WHERE sc.key = 'whatsapp_phone' AND sc.value = ? AND sc.organization_id = ?
  `, [phone, member.organizationId])

  return [
    ...locationRows.map(row => ({
      kind: 'location' as const,
      organizationId: row.organizationId,
      siteId: row.siteId,
      siteName: row.siteName,
      locationId: row.locationId,
      locationName: row.locationName,
    })),
    ...siteRows.map(row => ({
      kind: 'site' as const,
      organizationId: row.organizationId,
      siteId: row.siteId,
      siteName: row.siteName,
      locationId: null,
      locationName: null,
    })),
  ]
}

export interface ClearAssignmentsResult {
  cleared: PhoneAssignment[]
}

/**
 * Clears every assignment `findAssignmentsForMemberPhone` found for this
 * member — sets `notification_phone` to `null` on the matched locations and
 * deletes the matched `site_config['whatsapp_phone']` rows — so a later
 * config save (or the backfill script) can't reuse a still-configured number
 * to silently re-invite a manager who was just removed.
 *
 * Only the `'clear'` action is implemented. `'reassign'` (re-pointing these
 * same assignments at a different manager's number) needs a target-member
 * picker and its own grant flow via `ensureWhatsAppRecipientAccess` — a
 * bigger UI flow than this pass covers, so it's a documented follow-up rather
 * than a half-built mechanism.
 */
export async function clearOrReassignAssignments(
  db: DbClient,
  memberId: string,
  options: { action: 'clear' } | { action: 'reassign'; targetMemberId: string },
): Promise<ClearAssignmentsResult> {
  const assignments = await findAssignmentsForMemberPhone(db, memberId)
  if (assignments.length === 0) return { cleared: [] }

  if (options.action === 'reassign') {
    throw createError({
      statusCode: 501,
      statusMessage: 'Reassigning WhatsApp assignments to another manager is not implemented yet. Clear this member’s assignments and configure the new number directly.',
    })
  }

  const now = new Date().toISOString()
  const statements: Array<{ query: string; params: (string | null)[] }> = []
  for (const assignment of assignments) {
    if (assignment.kind === 'location' && assignment.locationId) {
      statements.push({
        query: `UPDATE business_locations SET notification_phone = NULL, updated_at = ? WHERE id = ?`,
        params: [now, assignment.locationId],
      })
    } else if (assignment.kind === 'site') {
      statements.push({
        query: `DELETE FROM site_config WHERE organization_id = ? AND site_id = ? AND key = 'whatsapp_phone'`,
        params: [assignment.organizationId, assignment.siteId],
      })
    }
  }

  if (statements.length > 0) {
    await executeBatch(db, statements)
  }

  return { cleared: assignments }
}
