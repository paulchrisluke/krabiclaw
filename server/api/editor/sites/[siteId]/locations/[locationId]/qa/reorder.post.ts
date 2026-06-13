// POST /api/editor/sites/[siteId]/locations/[locationId]/qa/reorder
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { reorderLocationQa } from '~/server/utils/mcp-workflows'

interface ReorderUpdate {
  id: string
  sort_order: number
}

function parseUpdates(value: unknown): ReorderUpdate[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const updates = value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const record = item as ApiRecord
    if (typeof record.id !== 'string' || !record.id.trim()) return null
    const sortOrder = Number(record.sort_order)
    if (!Number.isInteger(sortOrder)) return null
    return { id: record.id, sort_order: sortOrder }
  })
  if (updates.some(item => item === null)) return null
  return updates as ReorderUpdate[]
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.organization_id
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const body = await readBody(event)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates = parseUpdates((body as ApiRecord).updates)
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
