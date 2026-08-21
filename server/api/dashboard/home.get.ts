import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getDashboardHomeData } from '~/server/utils/dashboard-home'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: true })
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

  await assertSiteWideAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId: site.id,
  })

  return jsonResponse(await getDashboardHomeData(db, organization.id, site.id, {
    memberId: organization.memberId,
    role: organization.role,
  }))
})
