import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { createMetafieldDefinition } from '~/server/utils/product-management'
import type { MetafieldDefinition } from '~/shared/metafields'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<Omit<MetafieldDefinition, 'id' | 'organization_id'>>(event)
    const definition = await createMetafieldDefinition(db, {
      organizationId: site.organization_id,
      definition: { ...body, description: body.description ?? null, validations: body.validations ?? {}, localizable: body.localizable ?? false },
      actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, definition }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('metafield_definition_create_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create metafield definition' }, { status: 500 })
  }
})
