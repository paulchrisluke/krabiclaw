// POST /api/dashboard/organizations/deletion — permanently delete this
// organization after the dashboard's explicit destructive confirmation.

import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { deleteOrganizationNow } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const { env, organization } = await getDashboardContext(event, {})
  if (organization.role !== 'owner') {
    return jsonResponse({ error: 'Only an owner can delete this workspace' }, { status: 403 })
  }

  await deleteOrganizationNow(env, organization.id)
  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
