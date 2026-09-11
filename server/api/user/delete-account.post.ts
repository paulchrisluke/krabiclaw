// POST /api/user/delete-account — schedule this account for deletion.
//
// Nothing is removed here. The account and the organizations it owns alone are
// stamped with a due instant DELETION_GRACE_DAYS out; the deletion-sweep task
// performs the deletion when that instant passes, and DELETE on this route
// cancels it in the meantime. Sites keep serving through the grace period.

import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { DELETION_GRACE_DAYS, findPaidOrganization, listSoleOwnedOrganizationIds, scheduleAccountDeletion } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const soleOwnedOrganizationIds = await listSoleOwnedOrganizationIds(env, userId)

  const paidOrganizationId = await findPaidOrganization(db, soleOwnedOrganizationIds, new Date())
  if (paidOrganizationId) {
    return jsonResponse({
      error: 'active_subscription',
      message: 'Please cancel your subscription before deleting your account.',
    }, { status: 409 })
  }

  const { scheduledAt, organizationIds } = await scheduleAccountDeletion(env, userId, soleOwnedOrganizationIds)

  return jsonResponse({
    success: true,
    scheduled_at: scheduledAt.toISOString(),
    grace_days: DELETION_GRACE_DAYS,
    organization_ids: organizationIds,
  })
})
import { defineHandler } from 'nitro';
