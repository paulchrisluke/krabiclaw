import { getQuery, HTTPError, setHeader } from 'nitro/h3';
import { parseOgImageQuery, type OgImageRenderPayload } from '~/utils/social-metadata'
import { resolveOgImage } from '~/server/utils/og-image/pipeline'

/**
 * The dynamic, template-aware OG image render route (#259). Every page's og:image points
 * here with a payload built by composables/useSocialMetadata.ts. Root-level path (not under
 * /api/) keeps it available to social-platform crawlers despite the /api/** robots rule.
 */
export default defineHandler(async (event) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  let payload: OgImageRenderPayload
  try {
    payload = parseOgImageQuery(query)
  } catch (error) {
    throw new HTTPError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid OG image request',
    })
  }
  const result = await resolveOgImage(event, payload)

  setHeader(event, 'Content-Type', result.contentType)
  setHeader(event, 'Content-Length', String(result.bytes.byteLength))
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=31536000, immutable')
  setHeader(event, 'ETag', `"${result.cacheKey}"`)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'X-Og-Image-Source', result.source)

  return result.bytes
})
import { defineHandler } from 'nitro';
