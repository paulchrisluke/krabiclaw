import type { CreateProductCategoryInput } from '~/server/types/products'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { createProductCategory } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<CreateProductCategoryInput>(event, { name: 'string' })
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return jsonResponse({ error: 'name must be a non-empty Product category name' }, { status: 400 })
    }
    const category = await createProductCategory({
      db,
      organizationId: site.organization_id,
      siteId,
      locationId,
      name: body.name.trim(),
      actor: session.user.id,
    })
    return jsonResponse({ success: true, category }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_category_create_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create Product category' }, { status: 500 })
  }
})
