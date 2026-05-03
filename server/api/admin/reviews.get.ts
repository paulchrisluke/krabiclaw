import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'

const cleanStatus = (status: string | null) =>
  ['pending', 'approved', 'rejected'].includes(status ?? '') ? status : 'pending'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = getRequestURL(event)
  const status = cleanStatus(url.searchParams.get('status'))
  const slug = url.searchParams.get('slug')?.trim()

  const query = slug
    ? `SELECT id, menu_item_slug AS menuItemSlug, author, rating, title, content, status, created_at AS createdAt
       FROM reviews
       WHERE status = ? AND menu_item_slug = ?
       ORDER BY created_at DESC
       LIMIT 100`
    : `SELECT id, menu_item_slug AS menuItemSlug, author, rating, title, content, status, created_at AS createdAt
       FROM reviews
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT 100`

  const statement = env.REVIEWS_DB.prepare(query)
  const { results } = slug ? await statement.bind(status, slug).all() : await statement.bind(status).all()

  return jsonResponse({ reviews: results ?? [] })
})
