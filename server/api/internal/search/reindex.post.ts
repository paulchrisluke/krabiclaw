import { getHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

async function secretsMatch(expectedSecret: string, providedSecret: string) {
  const encoder = new TextEncoder()
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (_expectedDigest: BufferSource, _providedDigest: BufferSource) => boolean
  }
  const [expectedDigest, providedDigest] = await Promise.all([
    subtle.digest('SHA-256', encoder.encode(expectedSecret)),
    subtle.digest('SHA-256', encoder.encode(providedSecret)),
  ])

  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(expectedDigest, providedDigest)
  }

  const left = new Uint8Array(expectedDigest)
  const right = new Uint8Array(providedDigest)
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

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

  if (!(await secretsMatch(expectedSecret, providedSecret))) {
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
