import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { searchPublicResources } from '~/server/utils/public-search'

const IP_HOURLY_LIMIT = 120

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
    if (!import.meta.dev) {
      const clientIp = getClientIp(event)
      const hourWindow = Math.floor(Date.now() / 3_600_000)
      const rateLimitOk = await incrementHourlyRateLimit(
        db,
        `rate:public-search:ip:${await hashClientIp(clientIp)}:${hourWindow}`,
        IP_HOURLY_LIMIT,
        3_600_000,
      )
      if (!rateLimitOk) {
        return jsonResponse({ error: 'Too many requests. Please try again later.' }, { status: 429 })
      }
    }

    const results = await searchPublicResources(db, q, { type: type as 'all' | 'doc' | 'blog' | 'faq' | 'route', limit: 10 })
    return jsonResponse({ query: q, results })
  } catch (error) {
    console.error('Failed to run public search:', error)
    return jsonResponse({ error: 'Failed to search public resources' }, { status: 500 })
  }
})
