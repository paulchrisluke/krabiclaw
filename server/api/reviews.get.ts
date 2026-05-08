import { cleanString, cloudflareEnv, jsonResponse } from '../utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const url = getRequestURL(event)
  const slug = cleanString(url.searchParams.get('slug'), 120)

  if (!slug) return jsonResponse({ error: 'Missing menu item slug.' }, { status: 400 })

  const { results } = await env.REVIEWS_DB.prepare(
    `SELECT id, menu_item_slug AS menuItemSlug, author_name AS author, rating, title, content, created_at AS createdAt
     FROM reviews
     WHERE menu_item_slug = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(slug).all()

  return jsonResponse({ reviews: results ?? [] })
})
