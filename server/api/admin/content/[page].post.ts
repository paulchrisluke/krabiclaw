// POST /api/admin/content/[page] - Update platform page content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const ALLOWED_PAGES = ['about', 'contact', 'help']
const MAX_CONTENT_LENGTH = 1_000_000

export default defineEventHandler(async (event) => {
  const page = getRouterParam(event, 'page')
  if (!page) return jsonResponse({ error: 'Page required' }, { status: 400 })
  if (!ALLOWED_PAGES.includes(page)) return jsonResponse({ error: 'Invalid page' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email || !session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let body: { content?: string }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof body.content !== 'string') {
    return jsonResponse({ error: 'content must be a string' }, { status: 400 })
  }
  if (body.content.length > MAX_CONTENT_LENGTH) {
    return jsonResponse({ error: 'content too large' }, { status: 413 })
  }

  const now = new Date().toISOString()
  const userId = session.user.id
  const id = crypto.randomUUID()

  try {
    await db.prepare(
      `INSERT INTO platform_content (id, page, content, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(page) DO UPDATE SET content = excluded.content, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(id, page, body.content, userId, now).run()
  } catch (err) {
    console.error('Failed to save content:', err)
    return jsonResponse({ error: 'Failed to save content' }, { status: 500 })
  }

  return jsonResponse({ success: true, page, updated_at: now })
})
