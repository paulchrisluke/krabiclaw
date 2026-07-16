import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { resolveSeoUrl } from '~/composables/useSeoUrls'
import { useSchemaOrg } from '~/composables/useSchemaOrg'
import { useSocialMetadata } from '~/composables/useSocialMetadata'
import { inferSocialImageMimeType, type SocialImageSource, type SocialPageMetadataInput, type SocialPageType } from '~/utils/social-metadata'

export interface PlatformBreadcrumb {
  name: string
  url: string
}

export interface PlatformFaqItem {
  question: string
  answer: string
}

export type PlatformPageType =
  | 'WebPage'
  | 'AboutPage'
  | 'ContactPage'
  | 'CollectionPage'
  | 'ItemPage'
  | 'SoftwareApplication'

interface PlatformPageSeoInput {
  /** Page path, e.g. '/pricing'. Used to resolve the canonical/OG URL. */
  path: string
  title: string
  description: string
  ogImage?: string | null
  /** Set only when you need to override the default (indexable) robots behavior. */
  robots?: string | null
  breadcrumbs?: PlatformBreadcrumb[]
  /** Page-level schema.org type for the WebPage node. Defaults to 'WebPage'. */
  pageType?: PlatformPageType
  /** Extra raw schema.org nodes to merge into the emitted @graph (e.g. OfferCatalog, ItemList). */
  schemaNodes?: ApiRecord[]
  /** FAQ items visibly rendered on the page — emits a matching FAQPage node. */
  faqItems?: PlatformFaqItem[]
  /** SoftwareApplication-specific fields, used when pageType is 'SoftwareApplication'. */
  softwareApplication?: {
    applicationCategory?: string
    operatingSystem?: string
    offers?: ApiRecord
  }
  /** Set true on the homepage to also emit Organization + WebSite nodes. */
  isHomepage?: boolean
  /** Open Graph type for the #259 composer — distinct from `pageType`, which is the
   * schema.org @type. Set 'article' for blog/docs detail pages. Defaults to 'website'. */
  socialType?: SocialPageType
  /** A real photo to composite as the generated OG card's background (blog/docs featured
   * image). Omit for pages with no natural hero photo — falls back to the template gradient. */
  heroImage?: SocialImageSource | null
  /** Eyebrow/category label shown on the generated card, e.g. the doc's category or post's tag. */
  label?: string | null
  author?: string | null
  /** ISO 8601 date string. Only meaningful when socialType is 'article'. */
  publishedAt?: string | null
}

const PLATFORM_NAME = 'KrabiClaw'
const PLATFORM_DESCRIPTION = 'The AI-powered website builder for local businesses. Build your web presence through conversation with ChatGPT.'

/**
 * Shared SEO setup for platform-surface pages (marketing pages, and — via `socialType`/
 * `heroImage`/`author`/`publishedAt` — platform blog/docs detail pages). Sets canonical/meta/
 * OG/Twitter tags through the shared #259 composer and emits one SSR JSON-LD @graph.
 *
 * Not for tenant/Saya pages (use useTenantSocialMetadata instead — different origin-resolution
 * precedence, see useSeoUrls.ts).
 */
export function usePlatformPageSeo(input: MaybeRefOrGetter<PlatformPageSeoInput>) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()
  const origin = config.public.siteUrl || requestURL.origin

  const pageUrl = computed(() => resolveSeoUrl(toValue(input).path, origin))

  // Thin adapter over the shared #259 contract/composer — platform pages provide data,
  // useSocialMetadata emits the actual tag set (title/description/canonical/OG/Twitter).
  const socialInput = computed<SocialPageMetadataInput>(() => {
    const value = toValue(input)
    return {
      template: 'platform',
      pageType: value.socialType || 'website',
      title: value.title,
      description: value.description,
      canonicalUrl: pageUrl.value,
      brand: { siteName: PLATFORM_NAME, logoUrl: resolveSeoUrl('/krabi-claw-logo.png', origin), primaryColor: '#1e1b4b', secondaryColor: '#4338ca' },
      ogImageOverride: value.ogImage
        ? { url: resolveSeoUrl(value.ogImage, origin), type: inferSocialImageMimeType(value.ogImage) }
        : null,
      heroImage: value.heroImage ?? null,
      label: value.label ?? null,
      author: value.author ?? null,
      publishedAt: value.publishedAt ?? null,
      indexable: value.robots ? !/noindex/i.test(value.robots) : true,
      robots: value.robots ?? null,
    }
  })

  const { ogImageUrl: sharedOgImage } = useSocialMetadata(socialInput, origin)

  useSchemaOrg(computed(() => {
    const value = toValue(input)
    const siteRoot = resolveSeoUrl('/', origin).replace(/\/$/, '')
    const websiteId = `${siteRoot}/#website`
    const organizationId = `${siteRoot}/#organization`
    const url = pageUrl.value
    const webpageId = `${url}#webpage`
    const breadcrumbId = `${url}#breadcrumb`

    const graph: ApiRecord[] = []

    if (value.isHomepage) {
      graph.push({
        '@type': 'Organization',
        '@id': organizationId,
        name: PLATFORM_NAME,
        url: siteRoot,
        logo: `${siteRoot}/krabi-claw-logo.png`,
        description: PLATFORM_DESCRIPTION,
      })
    }

    graph.push({
      '@type': 'WebSite',
      '@id': websiteId,
      url: siteRoot,
      name: PLATFORM_NAME,
      description: PLATFORM_DESCRIPTION,
      publisher: { '@id': organizationId },
    })

    const webpageNode: ApiRecord = {
      '@type': value.pageType || 'WebPage',
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

    if (breadcrumbItems.length) {
      webpageNode.breadcrumb = { '@id': breadcrumbId }
    }

    if (value.pageType === 'SoftwareApplication' && value.softwareApplication) {
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
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer.trim(),
            },
          })),
      })
    }

    if (value.schemaNodes?.length) {
      for (const node of value.schemaNodes) {
        if (node?.['@id']) hasPart.push({ '@id': node['@id'] })
      }
      graph.push(...value.schemaNodes)
    }

    if (hasPart.length) {
      webpageNode.hasPart = hasPart.length === 1 ? hasPart[0] : hasPart
    }

    graph.push(webpageNode)

    if (breadcrumbItems.length) {
      graph.push({
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: breadcrumbItems,
      })
    }

    if (!graph.length) return null

    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    }
  }))

  return { pageUrl, sharedOgImage }
}
