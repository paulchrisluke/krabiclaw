import { cloudflareEnv, jsonResponse } from '../../utils/api-response'

const emptySnapshot = {
  business: null,
  reviews: [],
  media: [],
  posts: [],
  errors: [],
  syncedAt: null
}

const parseJson = (value: string | null) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'public, max-age=300') // 5 minutes cache

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!db) {
    return jsonResponse({
      ...emptySnapshot,
      errors: [{ source: 'db', message: 'No snapshot available. Run sync from /admin.' }]
    })
  }

  const row = await db.prepare(
    `SELECT business_json AS businessJson,
            reviews_json AS reviewsJson,
            media_json AS mediaJson,
            posts_json AS postsJson,
            errors_json AS errorsJson,
            synced_at AS syncedAt
     FROM google_business_snapshots
     WHERE id = 'current'`
  ).first() as any

  if (!row) {
    return jsonResponse({
      ...emptySnapshot,
      errors: [{ source: 'db', message: 'No snapshot available. Run sync from /admin.' }]
    })
  }

  try {
    return {
      business: parseJson(row.businessJson),
      reviews: parseJson(row.reviewsJson) ?? [],
      media: parseJson(row.mediaJson) ?? [],
      posts: parseJson(row.postsJson) ?? [],
      errors: parseJson(row.errorsJson) ?? [],
      syncedAt: row.syncedAt
    }
  } catch (error) {
    return jsonResponse({
      ...emptySnapshot,
      errors: [{ source: 'api', message: error instanceof Error ? error.message : String(error) }]
    }, { status: 500 })
  }
})
