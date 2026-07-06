import { getHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const expectedSecret = typeof env.PLATFORM_SEARCH_REINDEX_SECRET === 'string'
    ? env.PLATFORM_SEARCH_REINDEX_SECRET.trim()
    : ''
  if (!expectedSecret) {
    return jsonResponse({ error: 'PLATFORM_SEARCH_REINDEX_SECRET is not configured' }, { status: 500 })
  }

  const providedSecret = getHeader(event, 'x-krabiclaw-search-secret')
    ?? getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''

  if (providedSecret !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await rebuildPlatformKnowledgeIndex(env, env.db)
    return jsonResponse({ ok: true, ...result })
  } catch (error) {
    console.error('Failed to rebuild platform knowledge index:', error)
    return jsonResponse({ error: 'Failed to rebuild platform knowledge index' }, { status: 500 })
  }
})
