import { jsonResponse } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { defaultLinksPage, getLinksPage } from '~/server/utils/links-page'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const { db, organization } = await requireOrganizationAccess(event, organizationId)
  const result = await getLinksPage(db, organizationId)

  return jsonResponse({
    page: result.page ?? defaultLinksPage({
      organizationId: organization.id, brandName: organization.name, }), items: result.items, })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
