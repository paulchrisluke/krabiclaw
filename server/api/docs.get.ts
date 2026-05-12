// GET /api/docs - List public documentation files (bundled as Nitro server assets)
import { jsonResponse } from '~/server/utils/api-response'

const INTERNAL_DOCS = new Set(['billing-architecture'])

export default defineEventHandler(async () => {
  try {
    const storage = useStorage('assets:docs')
    const keys = await storage.getKeys()
    const mdKeys = keys.filter(k => k.endsWith('.md'))

    const docs = await Promise.all(
      mdKeys
        .filter(k => !INTERNAL_DOCS.has(k.replace('.md', '')))
        .map(async (key) => {
          const content = await storage.getItem(key) as string
          const titleMatch = content?.match(/^#\s+(.+)$/m)
          const slug = key.replace('.md', '')
          return {
            slug,
            title: titleMatch ? titleMatch[1] : slug,
            file: key
          }
        })
    )

    return jsonResponse({ docs })
  } catch (error) {
    console.error('Failed to load docs:', error)
    return jsonResponse({ error: 'Failed to load docs' }, { status: 500 })
  }
})
