// DELETE /api/admin/content/[page] - Remove platform page content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const ALLOWED_PAGES = ['about', 'contact', 'help']

export default defineEventHandler(async (event) => {
  const page = getRouterParam(event, 'page')
  if (!page) return jsonResponse({ error: 'Page required' }, { status: 400 })
  if (!ALLOWED_PAGES.includes(page)) return jsonResponse({ error: 'Invalid page' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email || !session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  try {
    await db.prepare(`DELETE FROM platform_content WHERE page = ?`).bind(page).run()
  } catch (err) {
    console.error('Failed to delete content:', err)
    return jsonResponse({ error: 'Failed to delete content' }, { status: 500 })
  }

  return jsonResponse({ success: true, page, deleted: true })
})