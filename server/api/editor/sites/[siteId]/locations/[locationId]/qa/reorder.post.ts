// POST /api/editor/sites/[siteId]/locations/[locationId]/qa/reorder
import { jsonResponse } from '~/server/utils/api-response'
import { reorderLocationQa } from '~/server/utils/mcp-workflows'
import { requireLocationAccess } from '~/server/utils/location-access'

interface ReorderUpdate {
  id: string
  sort_order: number
}

function parseUpdates(value: unknown): ReorderUpdate[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const updates = value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const record = item as { id?: unknown; sort_order?: unknown }
    if (typeof record.id !== 'string' || !record.id.trim()) return null
    const sortOrder = Number(record.sort_order)
    if (!Number.isInteger(sortOrder)) return null
    return { id: record.id, sort_order: sortOrder }
  })
  if (updates.some(item => item === null)) return null
  return updates as ReorderUpdate[]
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db, site } = await requireLocationAccess(event, siteId, locationId)

  const body = await readBody(event)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates = parseUpdates((body as { updates?: unknown }).updates)
  if (!updates || updates[0]!.id === updates[1]!.id) {
    return jsonResponse({ error: 'Two distinct Q&A reorder updates are required' }, { status: 400 })
  }

  try {
    const result = await reorderLocationQa(db, site.organization_id, siteId, locationId, updates)
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A reorder failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
