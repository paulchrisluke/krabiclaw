import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { resolveSeoUrl } from '~/composables/useSeoUrls'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import {
  composeSocialMetadata,
  type SocialBrand,
  type SocialImageSource,
  type SocialPageMetadataInput,
  type SocialPageType,
  type SocialTemplate,
} from '~/utils/social-metadata'
import { resolvePublicTemplate } from '~/utils/template-registry'

export interface PageBreadcrumb {
  name: string
  url: string
}

export interface PageFaqItem {
  question: string
  answer: string
}

export type SchemaPageType =
  | 'WebPage'
  | 'AboutPage'
  | 'ContactPage'
  | 'CollectionPage'
  | 'ItemPage'
  | 'SoftwareApplication'

export type PageSocialMetadataInput = Omit<SocialPageMetadataInput, 'template' | 'canonicalUrl' | 'brand'> & {
  path: string
  template?: SocialTemplate
  brand?: SocialBrand
  /**
   * Identifies which already-generated OG card (server/utils/social-image/generate.ts,
   * issue #685) belongs to this page — must match the owner_type/owner_id the page's
   * publish-time mutation path used when generating it (see server/utils/social-image-resolver.ts
   * and shared/media-placement-contract.ts for the supported owner types). For platform
   * marketing routes with no owning DB row, use `ownerType: 'platform'` and a stable route id
   * (e.g. 'home', 'about', 'templates:saya').
   */
  ownerType: string
  ownerId: string
  breadcrumbs?: PageBreadcrumb[]
  schemaPageType?: SchemaPageType
  schemaNodes?: ApiRecord[]
  faqItems?: PageFaqItem[]
  softwareApplication?: {
    applicationCategory?: string
    operatingSystem?: string
    offers?: ApiRecord
  }
  isHomepage?: boolean
  socialType?: SocialPageType
  schema?: boolean
}

interface SocialImageApiResponse {
  socialImage: SocialImageSource | null
}

const PLATFORM_NAME = 'KrabiClaw'
const PLATFORM_DESCRIPTION = 'The AI-powered website builder for local businesses. Build your web presence through conversation with ChatGPT.'

/** The single metadata entry point for every public page. */
export function useSocialMetadata(input: MaybeRefOrGetter<PageSocialMetadataInput>) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  const tenant = useTenantSite()
  const requestEvent = useRequestEvent()

  // Single-item server-side detail lookup for this page's already-generated OG card — SSR
  // reads the request's own D1 binding directly (never a nested self-fetch, which loses
  // Cloudflare bindings — see CLAUDE.md), client-side navigation falls back to the thin
  // /api/public/social-image route wrapping the same loadPersistedSocialImage() call.
  const socialImageKey = computed(() => {
    const value = toValue(input)
    return `social-image:${value.ownerType}:${value.ownerId}`
  })
  const { data: socialImage, error: socialImageError } = useAsyncData(
    socialImageKey,
    async (): Promise<SocialImageSource | null> => {
      const value = toValue(input)
      if (import.meta.server) {
        if (!requestEvent) return null
        const [{ cloudflareEnv }, { loadPersistedSocialImage }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/social-image-resolver'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
        return await loadPersistedSocialImage(db, value.ownerType, value.ownerId)
      }
      // Nuxt's typed-fetch route matching against this literal path produces a "Type
      // instantiation is excessively deep" TS2589 for reasons unrelated to this route's actual
      // (simple) response shape — bypass its generic route inference entirely; the response
      // shape is still explicitly and correctly typed via untypedFetch's own generic below.
      const untypedFetch = $fetch as unknown as (_url: string, _opts?: { query?: Record<string, string> }) => Promise<SocialImageApiResponse>
      const response = await untypedFetch('/api/public/social-image', {
        query: { ownerType: value.ownerType, ownerId: value.ownerId },
      })
      return response?.socialImage ?? null
    },
    { watch: [socialImageKey] },
  )

  const normalized = computed(() => {
    // Surface a real lookup failure (DB unavailable, fetch error) distinctly from "nothing was
    // resolved" — the generic error below would otherwise mask why the image is missing.
    if (socialImageError.value) throw socialImageError.value
    const value = toValue(input)
    const template = value.template ?? resolvePublicTemplate({ themeId: tenant.themeId }).slug
    const origin = template === 'platform'
      ? config.public.siteUrl || requestURL.origin
      : requestURL.origin || config.public.siteUrl
    const canonicalUrl = resolveSeoUrl(value.path, origin)
    const brand = value.brand ?? (template === 'platform'
      ? {
          siteName: PLATFORM_NAME,
          logoUrl: resolveSeoUrl('/krabi-claw-logo.png', origin),
        }
      : null)
    if (!brand?.siteName.trim()) throw new Error('Page social metadata requires a site name')
    if (!socialImage.value?.url) throw new Error(`Page social metadata requires a resolved social image for ${value.ownerType}:${value.ownerId} — see server/utils/social-image-resolver.ts`)
    const socialInput: SocialPageMetadataInput = {
      ...value,
      template,
      brand,
      pageType: value.socialType || value.pageType || 'website',
      canonicalUrl,
    }
    return { value, origin, template, tags: composeSocialMetadata(socialInput, socialImage.value) }
  })

  useHead(() => ({
    title: normalized.value.tags.title,
    meta: [
      { name: 'description', content: normalized.value.tags.description },
      { property: 'og:title', content: normalized.value.tags.ogTitle },
      { property: 'og:description', content: normalized.value.tags.ogDescription },
      { property: 'og:type', content: normalized.value.tags.ogType },
      { property: 'og:url', content: normalized.value.tags.ogUrl },
      { property: 'og:site_name', content: normalized.value.tags.ogSiteName },
      { property: 'og:image', content: normalized.value.tags.ogImage },
      { property: 'og:image:width', content: normalized.value.tags.ogImageWidth },
      { property: 'og:image:height', content: normalized.value.tags.ogImageHeight },
      { property: 'og:image:type', content: normalized.value.tags.ogImageType },
      { property: 'og:image:alt', content: normalized.value.tags.ogImageAlt },
      { name: 'twitter:card', content: normalized.value.tags.twitterCard },
      { name: 'twitter:title', content: normalized.value.tags.twitterTitle },
      { name: 'twitter:description', content: normalized.value.tags.twitterDescription },
      { name: 'twitter:image', content: normalized.value.tags.twitterImage },
      { name: 'twitter:image:alt', content: normalized.value.tags.twitterImageAlt },
      { property: 'article:author', content: normalized.value.tags.articleAuthor },
      { property: 'article:published_time', content: normalized.value.tags.articlePublishedTime },
      ...(normalized.value.tags.robots ? [{ name: 'robots', content: normalized.value.tags.robots }] : []),
    ].filter(item => item.content !== undefined),
    link: [{ rel: 'canonical', href: normalized.value.tags.canonicalUrl }],
  }))

  useSchemaOrg(computed(() => {
    const { value, origin, template, tags } = normalized.value
    if (template !== 'platform' || value.schema === false) return null
    const siteRoot = resolveSeoUrl('/', origin).replace(/\/$/, '')
    const websiteId = `${siteRoot}/#website`
    const organizationId = `${siteRoot}/#organization`
    const url = tags.canonicalUrl
    const webpageId = `${url}#webpage`
    const breadcrumbId = `${url}#breadcrumb`
    const graph: ApiRecord[] = []

    graph.push({
      '@type': 'Organization',
      '@id': organizationId,
      name: PLATFORM_NAME,
      url: siteRoot,
      logo: `${siteRoot}/krabi-claw-logo.png`,
      description: PLATFORM_DESCRIPTION,
    })
    graph.push({
      '@type': 'WebSite',
      '@id': websiteId,
      url: siteRoot,
      name: PLATFORM_NAME,
      description: PLATFORM_DESCRIPTION,
      publisher: { '@id': organizationId },
    })

    const webpageNode: ApiRecord = {
      '@type': value.schemaPageType || 'WebPage',
      '@id': webpageId,
      url,
      name: value.title,
      description: value.description || undefined,
      isPartOf: { '@id': websiteId },
    }
    const breadcrumbItems = (value.breadcrumbs ?? [])
      .filter(item => item?.name && item?.url)
      .map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: resolveSeoUrl(item.url, origin),
      }))
    if (breadcrumbItems.length) webpageNode.breadcrumb = { '@id': breadcrumbId }

    if (value.schemaPageType === 'SoftwareApplication' && value.softwareApplication) {
      webpageNode.applicationCategory = value.softwareApplication.applicationCategory
      webpageNode.operatingSystem = value.softwareApplication.operatingSystem
      if (value.softwareApplication.offers) webpageNode.offers = value.softwareApplication.offers
    }

    const hasPart: Array<{ '@id': string }> = []
    if (value.faqItems?.length) {
      const faqId = `${url}#faq`
      hasPart.push({ '@id': faqId })
      graph.push({
        '@type': 'FAQPage',
        '@id': faqId,
        mainEntity: value.faqItems
          .filter(item => item.question?.trim() && item.answer?.trim())
          .map(item => ({
            '@type': 'Question',
            name: item.question.trim(),
            acceptedAnswer: { '@type': 'Answer', text: item.answer.trim() },
          })),
      })
    }
    if (value.schemaNodes?.length) {
      for (const node of value.schemaNodes) {
        if (node?.['@id']) hasPart.push({ '@id': node['@id'] })
      }
      graph.push(...value.schemaNodes)
    }
    if (hasPart.length) webpageNode.hasPart = hasPart.length === 1 ? hasPart[0] : hasPart
    graph.push(webpageNode)
    if (breadcrumbItems.length) {
      graph.push({ '@type': 'BreadcrumbList', '@id': breadcrumbId, itemListElement: breadcrumbItems })
    }
    return { '@context': 'https://schema.org', '@graph': graph }
  }))

  return {
    canonicalUrl: computed(() => normalized.value.tags.canonicalUrl),
    ogImageUrl: computed(() => normalized.value.tags.ogImage),
  }
}
