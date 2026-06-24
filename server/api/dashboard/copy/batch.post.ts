// POST /api/dashboard/copy/batch — copy location-scoped content (menus, media, content,
// reviews, Q&A, experiences) from one location to another within the same site.
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { copyLocationBatch, type CopyBatchInput, type CopyEntityType } from '~/server/utils/copy-paste'

const VALID_ENTITY_TYPES: CopyEntityType[] = [
  'menus', 'menu_items', 'media_assets', 'site_content', 'reviews', 'location_qa', 'experiences',
]

export default defineEventHandler(async (event) => {
  const { env, db, organization, site, userId } = await getDashboardContext(event, { requireSite: true })
  if (!site) {
    return jsonResponse({ error: 'No site found. Complete onboarding first.' }, { status: 400 })
  }

  const body = await readBody(event).catch(() => ({})) as Partial<CopyBatchInput>

  if (!body.source_location_id || typeof body.source_location_id !== 'string') {
    return jsonResponse({ error: 'source_location_id is required' }, { status: 400 })
  }

  if (!body.target_location_id && !body.new_location) {
    return jsonResponse({ error: 'Either target_location_id or new_location must be provided' }, { status: 400 })
  }

  if (!Array.isArray(body.entities) || body.entities.length === 0) {
    return jsonResponse({ error: 'entities must be a non-empty array' }, { status: 400 })
  }

  for (const config of body.entities) {
    if (!config || typeof config !== 'object' || !VALID_ENTITY_TYPES.includes(config.type)) {
      return jsonResponse({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 })
    }
  }

  const result = await copyLocationBatch(
    env as Record<string, string | undefined>,
    db,
    organization.id,
    site.id,
    userId,
    {
      source_location_id: body.source_location_id,
      target_location_id: typeof body.target_location_id === 'string' ? body.target_location_id : undefined,
      new_location: body.new_location,
      entities: body.entities,
      field_overrides: body.field_overrides,
    },
  )

  if (!result.success) {
    return jsonResponse({ error: result.error ?? 'Failed to copy location data' }, { status: 400 })
  }

  return jsonResponse({ success: true, manifest: result.manifest })
})
