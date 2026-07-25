// GET /api/admin/content/[page] - Get platform page content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { queryFirst } from '~/server/db'

import { ALLOWED_PLATFORM_CONTENT_PAGES } from '~/utils/platform-content-pages'

export default defineEventHandler(async (event) => {
  const page = getRouterParam(event, 'page')
  if (!page) return jsonResponse({ error: 'Page required' }, { status: 400 })
  if (!ALLOWED_PLATFORM_CONTENT_PAGES.includes(page)) return jsonResponse({ error: 'Invalid page' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

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
