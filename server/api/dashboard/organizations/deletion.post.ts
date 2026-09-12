// POST /api/dashboard/organizations/deletion — schedule this organization,
// and therefore its sites, for deletion.
//
// Only an owner can ask. Nothing is removed here: the organization is stamped
// with a due instant DELETION_GRACE_DAYS out and the deletion-sweep task
// performs the deletion when it passes. The sites keep serving and their
// subdomains stay reserved until then; DELETE cancels.

import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { DELETION_GRACE_DAYS, findPaidOrganization, scheduleOrganizationDeletion } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const { env, db, organization } = await getDashboardContext(event, { requireSite: false })
  if (organization.role !== 'owner') {
    return jsonResponse({ error: 'Only an owner can delete this workspace' }, { status: 403 })
  }

  const paidOrganizationId = await findPaidOrganization(db, [organization.id], new Date())
  if (paidOrganizationId) {
    return jsonResponse({
      error: 'active_subscription',
      message: 'Please cancel your subscription before deleting this workspace.',
    }, { status: 409 })
  }

  const { scheduledAt } = await scheduleOrganizationDeletion(env, organization.id)
  return jsonResponse({
    success: true,
    scheduled_at: scheduledAt.toISOString(),
    grace_days: DELETION_GRACE_DAYS,
  })
})
import { defineHandler } from 'nitro';
