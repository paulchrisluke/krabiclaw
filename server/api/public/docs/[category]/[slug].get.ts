// GET /api/public/docs/[category]/[slug] - Get single published doc, scoped to its category
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPlatformDoc } from '~/server/utils/platform-content'
import { slugToCategory } from '~/utils/docs-categories'

export default defineEventHandler(async (event) => {
  const categorySlug = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!categorySlug || !slug) return jsonResponse({ error: 'Category and slug required' }, { status: 400 })

  const category = slugToCategory(categorySlug)
  if (!category) return jsonResponse({ error: 'Documentation not found' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const doc = await getPublishedPlatformDoc(db, category, slug)
    if (!doc) return jsonResponse({ error: 'Documentation not found' }, { status: 404 })

    return jsonResponse({ doc })
  } catch (err) {
    console.error('Failed to fetch doc:', err)
    return jsonResponse({ error: 'Failed to load doc' }, { status: 500 })
  }
})
