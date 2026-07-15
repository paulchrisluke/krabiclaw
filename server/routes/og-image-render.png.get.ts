import { getQuery, setHeader } from 'h3'
import { parseOgImageQuery } from '~/utils/social-metadata'
import { createFallbackOgImageResult, resolveOgImage } from '~/server/utils/og-image/pipeline'

/**
 * The dynamic, template-aware OG image render route (#259). Every page's og:image either
 * points here (with a payload built by composables/useSocialMetadata.ts) or is an explicit
 * override supplied by the page itself. Root-level path (not under /api/) so social-platform
 * crawlers aren't affected by @nuxt/robots' default /api/** disallow rule.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const payload = parseOgImageQuery(query)
  const result = await resolveOgImage(event, payload).catch((error) => {
    console.error('[og-image] pipeline failed, serving static fallback', error)
    return createFallbackOgImageResult(payload)
  })

  setHeader(event, 'Content-Type', result.contentType)
  setHeader(event, 'Content-Length', result.bytes.byteLength)
  setHeader(event, 'Cache-Control', result.source === 'fallback'
    ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=60'
    : 'public, max-age=3600, s-maxage=31536000, immutable')
  setHeader(event, 'ETag', `"${result.cacheKey}"`)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'X-Og-Image-Source', result.source)
  if (result.fallbackReason) setHeader(event, 'X-Og-Image-Fallback-Reason', result.fallbackReason)

  return result.bytes
})
