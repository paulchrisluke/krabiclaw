import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getDashboardHomeData } from '~/server/utils/dashboard-home'
import { assertSiteWideAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const { env, db, organization, site } = await getDashboardContext(event, { requireSite: true })
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

  const principal = memberAccessPrincipal(organization, { env, siteId: site.id, event })
  await assertSiteWideAccess(db, principal)

  return jsonResponse(await getDashboardHomeData(db, organization.id, site.id, principal))
})
