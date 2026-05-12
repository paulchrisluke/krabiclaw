// GET /api/docs/[slug] - Get a single documentation file (bundled as Nitro server asset)
import { jsonResponse } from '~/server/utils/api-response'

const INTERNAL_DOCS = new Set(['billing-architecture'])
const VALID_SLUG = /^[a-zA-Z0-9-_]+$/

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug || !VALID_SLUG.test(slug)) {
    return jsonResponse({ error: 'Invalid slug' }, { status: 400 })
  }

  if (INTERNAL_DOCS.has(slug)) {
    return jsonResponse({ error: 'Not found' }, { status: 404 })
  }

  try {
    const storage = useStorage('assets:docs')
    const content = await storage.getItem(`${slug}.md`) as string | null

    if (!content) return jsonResponse({ error: 'Documentation not found' }, { status: 404 })

    const titleMatch = content.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : slug

    return jsonResponse({ slug, title, content })
  } catch (error) {
    console.error('Failed to load doc:', slug, error)
    return jsonResponse({ error: 'Documentation not found' }, { status: 404 })
  }
})
