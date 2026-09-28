import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { reorderDocs } from '~/server/utils/content/publishing'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  try {
    const { db, organization } = await requireOrganizationAccess(event, organizationId)
    const body = await readStrictBody<{ post_ids: unknown }>(event, { post_ids: 'unknown' })
    if (!Array.isArray(body.post_ids) || body.post_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'post_ids must contain non-empty post IDs' }, { status: 400 })
    }
    await reorderDocs(db, organization.id, body.post_ids.map(id => String(id).trim()))
    return jsonResponse({ success: true })
  } catch (error) {
    rethrowHttpError(error)
    console.error('docs_reorder_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder documentation' }, { status: 500 })
  }
})
