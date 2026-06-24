// GET /api/admin/content/[page] - Get platform page content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const page = getRouterParam(event, 'page')
  if (!page) return jsonResponse({ error: 'Page required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email || !session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  let row
  try {
    row = await queryFirst(db, `SELECT id, page, content, updated_by, updated_at FROM platform_content WHERE page = ? LIMIT 1`, [page])
  } catch (err) {
    console.error('Failed to fetch content:', err)
    return jsonResponse({ error: 'Failed to fetch content' }, { status: 500 })
  }

  if (!row) {
    return jsonResponse({ page, content: '', exists: false })
  }

  return jsonResponse({ ...row, exists: true })
})
