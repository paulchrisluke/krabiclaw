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
  setHeader(event, 'cache-control', 'public, max-age=60')

  const db = event.context.cloudflare?.env?.REVIEWS_DB
  if (!db) return emptySnapshot

  const row = await db.prepare(
    `SELECT business_json AS businessJson,
            reviews_json AS reviewsJson,
            media_json AS mediaJson,
            posts_json AS postsJson,
            errors_json AS errorsJson,
            synced_at AS syncedAt
     FROM google_business_snapshots
     WHERE id = 'current'`
  ).first<{
    businessJson: string | null
    reviewsJson: string | null
    mediaJson: string | null
    postsJson: string | null
    errorsJson: string | null
    syncedAt: string | null
  }>()

  if (!row) return emptySnapshot

  return {
    business: parseJson(row.businessJson),
    reviews: parseJson(row.reviewsJson) ?? [],
    media: parseJson(row.mediaJson) ?? [],
    posts: parseJson(row.postsJson) ?? [],
    errors: parseJson(row.errorsJson) ?? [],
    syncedAt: row.syncedAt
  }
})
