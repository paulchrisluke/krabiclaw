import type { BlawbyRouteRecipe } from '~/types/blawby'
import { publicApiRequest } from '~/utils/api-clients'
import { isBlawbyDocumentPayload, type BlawbyDocumentPayload } from '~/utils/blawby-document-contract'

export interface BlawbyRouteTarget {
  recipe: BlawbyRouteRecipe
  slug: string | null
}

export function resolveBlawbyPath(path: string): string {
  const match = path.match(/^\/preview\/(?:site|draft)\/[^/]+(\/.*)?$/)
  const resolvedPath = match?.[1] || (match ? '/' : path)
  return resolvedPath.length > 1 ? resolvedPath.replace(/\/+$/, '') : resolvedPath
}

export function resolveBlawbyRouteTarget(path: string, params: Record<string, unknown> = {}): BlawbyRouteTarget {
  const routePath = resolveBlawbyPath(path)
  if (routePath === '/') return { recipe: 'home', slug: null }
  if (routePath === '/links') return { recipe: 'links', slug: null }
  if (routePath === '/services') return { recipe: 'services', slug: null }
  if (/^\/services\/[^/]+$/.test(routePath)) return { recipe: 'offering', slug: String(params.slug || '') }
  if (routePath === '/about') return { recipe: 'about', slug: null }
  if (routePath === '/pricing') return { recipe: 'pricing', slug: null }
  if (routePath === '/contact') return { recipe: 'contact', slug: null }
  if (routePath === '/contact/confirmed') return { recipe: 'confirmation', slug: null }
  if (routePath === '/schedule') return { recipe: 'schedule', slug: null }
  if (routePath === '/blog') return { recipe: 'blog', slug: null }
  if (/^\/article\/[^/]+$/.test(routePath)) return { recipe: 'article', slug: String(params.slug || '') }
  if (routePath === '/donate') return { recipe: 'donate', slug: null }
  if (routePath === '/policies/privacy') return { recipe: 'privacy', slug: null }
  if (routePath === '/policies/terms') return { recipe: 'terms', slug: null }
  if (routePath === '/third-party-notices') return { recipe: 'third-party-notices', slug: null }
  throw createError({ statusCode: 404, statusMessage: 'Unsupported Blawby route' })
}

export async function useBlawbyDocument(
  recipe: BlawbyRouteRecipe,
  slug?: string | null,
  options: { server?: boolean; lazy?: boolean } = {},
) {
  const { siteId, draftId, isTenant } = useTenantSite()
  const locale = useState<string>('public-locale', () => 'en')
  const entityId = siteId || draftId
  if (!isTenant || !entityId) {
    throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
  }

  const normalizedSlug = slug?.trim() || ''
  const route = useRoute()
  const previewToken = draftId && typeof route.query.token === 'string' ? route.query.token : null
  const key = `blawby-document-${entityId}-${recipe}-${normalizedSlug || 'index'}-${locale.value}`
  const asyncData = await useAsyncData<BlawbyDocumentPayload>(
    key,
    async () => {
      if (import.meta.server) {
        const requestEvent = useRequestEvent()
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        if (draftId) {
          const { loadPublicDraftBlawbyDocument } = await import('~/server/utils/public-draft-bootstrap')
          return await loadPublicDraftBlawbyDocument(requestEvent, draftId, previewToken ?? undefined, recipe)
        }
        if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
        const { loadPublicBlawbyDocument } = await import('~/server/utils/public-blawby-document')
        return await loadPublicBlawbyDocument(requestEvent, siteId, recipe, {
          slug: normalizedSlug,
          locale: locale.value,
          mutateResponseHeaders: false,
        })
      }
      if (draftId) {
        return await publicApiRequest<BlawbyDocumentPayload>('/api/public/drafts/' + encodeURIComponent(draftId) + '/blawby/document', {
          query: { recipe, ...(previewToken ? { token: previewToken } : {}) },
          validate: value => isBlawbyDocumentPayload(value, recipe),
        })
      }
      if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Blawby site context is unavailable' })
      return await publicApiRequest<BlawbyDocumentPayload>('/api/public/sites/' + encodeURIComponent(siteId) + '/blawby/document', {
        query: { recipe, locale: locale.value, ...(normalizedSlug ? { slug: normalizedSlug } : {}) },
        validate: value => isBlawbyDocumentPayload(value, recipe),
      })
    },
    {
      server: options.server ?? true,
      lazy: options.lazy ?? false,
      dedupe: 'defer',
      getCachedData(cacheKey) {
        return useNuxtApp().payload.data[cacheKey] as BlawbyDocumentPayload | undefined
      },
    },
  )

  if (!asyncData.data.value && (asyncData.status.value === 'idle' || asyncData.status.value === 'pending')) {
    await asyncData.execute({ dedupe: 'defer' })
  }
  if (asyncData.error.value) throw asyncData.error.value
  if (!asyncData.data.value && options.server !== false) {
    throw createError({ statusCode: 500, statusMessage: 'Blawby document data was not returned' })
  }

  return {
    ...asyncData,
    data: asyncData.data as Ref<BlawbyDocumentPayload>,
  }
}
