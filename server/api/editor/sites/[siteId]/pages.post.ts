import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { createTenantPage } from '~/server/utils/tenant-pages'
import type { TenantPageEditorInput } from '~/server/utils/tenant-pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readRequiredBody<TenantPageEditorInput>(event)
    // A pageId references a tenant_pages row the write-access check above
    // already scoped to this site/org, and createTenantPage re-derives
    // pageType/recipe from THAT existing row rather than trusting the
    // client's own pageType - so "this request references an existing page"
    // is sufficient to trust it as a translation of a system page (Home/
    // About/Contact) rather than a client minting an arbitrary new one, which
    // trustedSystemPage otherwise exists to block.
    return jsonResponse(await createTenantPage(db, {
      organizationId: site.organization_id, siteId, userId, data: body, trustedSystemPage: Boolean(body.pageId), }), { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
