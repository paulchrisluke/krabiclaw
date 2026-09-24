import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { createMetafieldDefinition } from '~/server/utils/product-management'
import type { MetafieldDefinition } from '~/shared/metafields'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  try {
    const { db, session, organization } = await requireOrganizationAccess(event, organizationId)
    const body = await readRequiredBody<Omit<MetafieldDefinition, 'id' | 'organization_id'>>(event)
    const definition = await createMetafieldDefinition(db, {
      organizationId: organization.id,
      definition: { ...body, description: body.description ?? null, validations: body.validations ?? {}, localizable: body.localizable ?? false },
      actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, definition }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('metafield_definition_create_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create metafield definition' }, { status: 500 })
  }
})
