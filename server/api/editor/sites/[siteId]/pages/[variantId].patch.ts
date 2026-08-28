import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { updateTenantPage } from '~/server/utils/tenant-pages'
import type { TenantPageEditorInput } from '~/server/utils/tenant-pages'
import { syncSocialImageForOwnerAfterCommit } from '~/server/utils/social-image/sync'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, env, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const payload = await updateTenantPage(db, variantId, {
      userId, scope: { siteId, organizationId: site.organization_id }, data: await readRequiredBody<TenantPageEditorInput>(event), })
    await syncSocialImageForOwnerAfterCommit(db, env, {
      siteId,
      ownerType: 'tenant_page',
      ownerId: payload.page.id,
      title: payload.page.title,
      description: payload.page.summary,
      blocks: payload.page.blocks,
    })
    return jsonResponse(finalizeRequestMetrics(event, 'editor-tenant-page-update', payload))
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page document' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
