import { HTTPError, type H3Event } from 'nitro'
import { setHeader } from 'nitro/h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { resolvePublicBlawbyDocumentOrThrow } from '~/server/utils/professional-services'
import {
  buildPublicBlawbyDocumentCacheKey,
  getPublicResourceCache,
  putPublicResourceCache,
} from '~/server/utils/public-resource-cache'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import { isPreviewContext } from '~/server/utils/tenant-hosts'
import { BLAWBY_ROUTE_RECIPES, type BlawbyRouteRecipe } from '~/types/blawby'
import {
  isBlawbyDocumentPayload,
  type BlawbyDocumentPayload,
} from '~/utils/blawby-document-contract'

const RECIPES = new Set<BlawbyRouteRecipe>(BLAWBY_ROUTE_RECIPES)
const SLUG_PATTERN = /^[a-z0-9_-]+$/

export interface PublicBlawbyDocumentLoadOptions {
  slug?: string | null
  mutateResponseHeaders?: boolean
  signal?: AbortSignal
}

async function trackBackgroundWork(event: H3Event, operation: Promise<void>) {
  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) {
    waitUntil(operation)
    return
  }
  await operation
}

export async function loadPublicBlawbyDocument(
  event: H3Event,
  siteId: string,
  recipe: BlawbyRouteRecipe,
  options: PublicBlawbyDocumentLoadOptions = {},
): Promise<BlawbyDocumentPayload> {
  options.signal?.throwIfAborted()
  const slug = options.slug?.trim() || null
  if (!RECIPES.has(recipe)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Valid Blawby route recipe required' })
  }
  if ((recipe === 'offering' || recipe === 'article') && !slug) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Blawby route slug required' })
  }
  if (slug && !SLUG_PATTERN.test(slug)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Invalid Blawby route slug' })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const host = event.req.headers.get('host') ?? ''
  const cache = env.SITE_CACHE
  const useCache = !isPreviewContext(host) && Boolean(cache)
  const cacheKey = buildPublicBlawbyDocumentCacheKey(siteId, recipe, slug)
  const mutateResponseHeaders = options.mutateResponseHeaders ?? true

  if (useCache && cache) {
    const cacheStartedAt = performance.now()
    const cached = await getPublicResourceCache(cache, cacheKey)
    recordRequestPhase(event, 'cache', cacheStartedAt)
    options.signal?.throwIfAborted()
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as unknown
        if (!isBlawbyDocumentPayload(parsed)) throw new Error('Blawby document cache contract mismatch')
        if (mutateResponseHeaders) setHeader(event, 'x-bootstrap-cache', 'HIT')
        return parsed
      } catch (error) {
        console.warn('[public-resource-cache] corrupt Blawby document entry', {
          siteId,
          recipe,
          slug,
          error: error instanceof Error ? error.message : String(error),
        })
        await trackBackgroundWork(event, cache.delete(cacheKey).catch((deleteError: unknown) => {
          console.warn('[public-resource-cache] corrupt Blawby document deletion failed', {
            siteId,
            recipe,
            slug,
            error: String(deleteError),
          })
        }))
      }
    }
    if (mutateResponseHeaders) setHeader(event, 'x-bootstrap-cache', 'MISS')
  } else if (mutateResponseHeaders) {
    setHeader(event, 'x-bootstrap-cache', cache ? 'SKIP' : 'NO-KV')
  }

  const loadStartedAt = performance.now()
  const payload = await resolvePublicBlawbyDocumentOrThrow(db, siteId, recipe, { slug })
  recordRequestPhase(event, 'document', loadStartedAt)
  options.signal?.throwIfAborted()

  if (useCache && cache) {
    await trackBackgroundWork(
      event,
      putPublicResourceCache(cache, cacheKey, JSON.stringify(payload))
        .catch(error => console.warn('[public-resource-cache] Blawby document put failed:', String(error))),
    )
  }
  return payload
}
