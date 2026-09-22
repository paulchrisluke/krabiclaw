import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { createTenantPage } from '~/server/utils/content/pages'
import type { TenantPageEditorInput } from '~/server/utils/content/pages'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, db, organization, userId } = await requireTenantPageWriteAccess(event, organizationId)
  try {
    const body = await readRequiredBody<TenantPageEditorInput>(event)
    return jsonResponse(await createTenantPage(db, {
      organizationId, userId, data: body, env, }), { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
