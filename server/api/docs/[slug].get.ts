// GET /api/docs/[slug] - Get specific documentation file
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  // Sanitize slug to prevent path traversal
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    return jsonResponse({ error: 'Invalid slug' }, { status: 400 })
  }

  const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '')
  if (safeSlug !== slug) {
    return jsonResponse({ error: 'Invalid slug format' }, { status: 400 })
  }

  try {
    const docsDir = resolve(process.cwd(), 'docs')
    const filePath = resolve(docsDir, `${safeSlug}.md`)
    
    // Verify the resolved path is within docs directory
    if (!filePath.startsWith(docsDir)) {
      return jsonResponse({ error: 'Invalid file path' }, { status: 403 })
    }

    const content = await readFile(filePath, 'utf-8')
    const titleMatch = content.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : safeSlug

    return jsonResponse({ slug: safeSlug, title, content })
  } catch (error) {
    return jsonResponse({ error: 'Documentation not found' }, { status: 404 })
  }
})
