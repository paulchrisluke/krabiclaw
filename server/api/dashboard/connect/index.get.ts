import { defineHandler } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { jsonResponse } from '~/server/utils/api-response'
import { getStripeConnectedAccount } from '~/server/utils/stripe-connect'

export default defineHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  assertOrganizationAccess(organization.role)
  return jsonResponse({
    success: true,
    account: await getStripeConnectedAccount(db, organization.id),
  })
})
