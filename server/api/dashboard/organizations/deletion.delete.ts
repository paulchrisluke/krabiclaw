// DELETE /api/dashboard/organizations/deletion — cancel a scheduled
// organization deletion.

import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { cancelOrganizationDeletion } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const { env, organization } = await getDashboardContext(event, { requireSite: false })
  if (organization.role !== 'owner') {
    return jsonResponse({ error: 'Only an owner can delete this workspace' }, { status: 403 })
  }
  await cancelOrganizationDeletion(env, organization.id)
  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
