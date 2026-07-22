// DELETE /api/admin/content/[page] - Remove platform page content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { execute } from '~/server/db'

import { ALLOWED_PLATFORM_CONTENT_PAGES } from '~/utils/platform-content-pages'

export default defineEventHandler(async (event) => {
  const page = getRouterParam(event, 'page')
  if (!page) return jsonResponse({ error: 'Page required' }, { status: 400 })
  if (!ALLOWED_PLATFORM_CONTENT_PAGES.includes(page)) return jsonResponse({ error: 'Invalid page' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email || !session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  try {
    const result = await execute(db, `DELETE FROM platform_content WHERE page = ?`, [page])
    if (!result?.meta?.changes) {
      return jsonResponse({ error: 'Content not found', page, deleted: false }, { status: 404 })
    }
  } catch (err) {
    console.error('Failed to delete content:', err)
    return jsonResponse({ error: 'Failed to delete content' }, { status: 500 })
  }

  return jsonResponse({ success: true, page, deleted: true })
})
