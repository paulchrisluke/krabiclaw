// GET /api/admin/platform/media - List platform media assets
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { listPlatformMediaAssets } from '~/server/utils/platform-media'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  const query = getQuery(event)
  const parsed = Number.parseInt(String(query.limit || '50'), 10)
  const limit = Math.min(Math.max(Number.isNaN(parsed) ? 50 : parsed, 1), 100)
  const id = Array.isArray(query.id) ? query.id[0] : (query.id as string | undefined)

  try {
    const results = await listPlatformMediaAssets(db, { id, kind: 'image', limit })
    return jsonResponse({ media: results ?? [] })
  } catch (err) {
    console.error('Failed to fetch platform media:', err)
    return jsonResponse({ error: 'Failed to load media' }, { status: 500 })
  }
})
