import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const userId = session.user.id

  // Find orgs where this user is the SOLE owner (subquery counts all owners per org)
  const ownedOrgsResult = await db.prepare(`
    SELECT m.organizationId as id
    FROM member m
    WHERE m.userId = ? AND m.role = 'owner'
    AND (
      SELECT COUNT(*) FROM member m2
      WHERE m2.organizationId = m.organizationId AND m2.role = 'owner'
    ) = 1
  `).bind(userId).all() as { results?: Array<{ id: string }> } | null

  const soleOwnedOrgIds: string[] = (ownedOrgsResult?.results ?? []).map((r: ApiValue) => r.id)

  // Find all org memberships for cleanup
  const allMemberships = await db.prepare(`
    SELECT DISTINCT organizationId FROM member WHERE userId = ?
  `).bind(userId).all() as { results?: Array<{ organizationId: string }> } | null

  const allOrgIds: string[] = (allMemberships?.results ?? []).map((r: ApiValue) => r.organizationId)

  // Single query: block deletion if any org has an active subscription
  if (allOrgIds.length > 0) {
    const placeholders = allOrgIds.map(() => '?').join(',')
    const statusPlaceholders = ACTIVE_STATUSES.map(() => '?').join(',')
    const activeSubscription = await db.prepare(`
      SELECT organization_id FROM organization_billing
      WHERE organization_id IN (${placeholders})
      AND status IN (${statusPlaceholders})
      LIMIT 1
    `).bind(...allOrgIds, ...ACTIVE_STATUSES).first()

    if (activeSubscription) {
      return jsonResponse(
        { error: 'active_subscription', message: 'Please cancel your subscription before deleting your account.' },
        { status: 409 }
      )
    }
  }

  // For each sole-owned org, block if other members exist (would lose access)
  for (const orgId of soleOwnedOrgIds) {
    const otherMembers = await db.prepare(`
      SELECT COUNT(*) as count FROM member WHERE organizationId = ? AND userId != ?
    `).bind(orgId, userId).first() as { count: number } | null

    if ((otherMembers?.count ?? 0) > 0) {
      return jsonResponse(
        { error: 'org_has_members', message: 'Transfer ownership or remove all members before deleting your account.' },
        { status: 409 }
      )
    }
  }

  // Delete in correct order: member rows first, then orgs (avoids FK violations),
  // then the user row (cascades sessions/accounts)
  const statements = []

  // Remove user from all orgs (co-owned orgs: removes membership; sole-owned: clears before org delete)
  for (const orgId of allOrgIds) {
    statements.push(db.prepare(`DELETE FROM member WHERE organizationId = ? AND userId = ?`).bind(orgId, userId))
  }

  // Delete sole-owned orgs (safe now that member rows are removed above)
  for (const orgId of soleOwnedOrgIds) {
    statements.push(db.prepare(`DELETE FROM organization WHERE id = ?`).bind(orgId))
  }

  // Delete user — cascades to session, account rows
  statements.push(db.prepare(`DELETE FROM user WHERE id = ?`).bind(userId))

  if (statements.length > 0) {
    await db.batch(statements)
  }

  return jsonResponse({ success: true })
})
