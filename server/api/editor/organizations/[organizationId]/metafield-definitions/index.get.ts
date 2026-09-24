import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { listMetafieldDefinitions } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  try {
    const { db, organization } = await requireOrganizationAccess(event, organizationId)
    // The tenant's whole product attribute vocabulary. Adding to it is how a
    // new descriptive attribute comes into existence.
    return jsonResponse({ success: true, definitions: await listMetafieldDefinitions(db, organization.id) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('metafield_definitions_list_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list metafield definitions' }, { status: 500 })
  }
})
