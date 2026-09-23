import { defineHandler } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertRoleAllows } from '~/server/utils/member-access'
import { jsonResponse } from '~/server/utils/api-response'
import { getStripeConnectedAccount } from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, {})
  // Connecting the organization's Stripe account is an integration change:
  // owner and admin, per utils/organization-access.ts.
  await assertRoleAllows({ organizationId: organization.id, role: organization.role, permissions: { integrations: ['update'] } })
  return jsonResponse({
    success: true,
    account: await getStripeConnectedAccount(db, organization.id),
  })
})
