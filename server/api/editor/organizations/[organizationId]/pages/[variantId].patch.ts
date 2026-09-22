import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { updateTenantPage } from '~/server/utils/content/pages'
import type { TenantPageEditorInput } from '~/server/utils/content/pages'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const variantId = getRouterParam(event, 'variantId')
  if (!organizationId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { env, db, organization, userId } = await requireTenantPageWriteAccess(event, organizationId)
  try {
    const payload = await updateTenantPage(db, variantId, {
      userId, scope: { organizationId }, data: await readRequiredBody<TenantPageEditorInput>(event), env, })
    return jsonResponse(finalizeRequestMetrics(event, 'editor-tenant-page-update', payload))
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page document' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
