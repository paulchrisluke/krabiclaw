import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { searchPublicResources } from '~/server/utils/public-search'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''
  const type = typeof query.type === 'string' ? query.type : 'all'
  const validTypes = new Set(['all', 'doc', 'blog', 'faq', 'route'])

  if (!q.trim()) {
    return jsonResponse({ error: 'q is required' }, { status: 400 })
  }
  if (!validTypes.has(type)) {
    return jsonResponse({ error: 'type must be one of all, doc, blog, faq, route' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const results = await searchPublicResources(db, q, { type: type as 'all' | 'doc' | 'blog' | 'faq' | 'route', limit: 10 })
    return jsonResponse({ query: q, results })
  } catch (error) {
    console.error('Failed to run public search:', error)
    return jsonResponse({ error: 'Failed to search public resources' }, { status: 500 })
  }
})
