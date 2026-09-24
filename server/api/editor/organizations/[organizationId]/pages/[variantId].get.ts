import { jsonResponse } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { getTenantPageById } from '~/server/utils/content/pages'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const variantId = getRouterParam(event, 'variantId')
  if (!organizationId || !variantId) return jsonResponse({ error: 'Organization and page IDs are required' }, { status: 400 })
  const { db } = await requireTenantPageWriteAccess(event, organizationId)
  const page = await getTenantPageById(db, variantId, { organizationId })
  return jsonResponse({ page })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
