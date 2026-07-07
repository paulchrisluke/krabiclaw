import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { markdownToPlainText } from '~/utils/markdown'
import { resolveSeoUrl } from '~/composables/useSeoUrls'
import { useSchemaOrg } from '~/composables/useSchemaOrg'

type ContentArticleType = 'BlogPosting' | 'TechArticle' | 'Article'

interface ContentBreadcrumb {
  name: string
  url: string
}

interface ContentFaqItem {
  question?: string | null
  answer?: string | null
}

interface ContentHowToStep {
  name?: string | null
  text?: string | null
  url?: string | null
  image_public_url?: string | null
  image_width?: number | null
  image_height?: number | null
}

interface ContentAiAssistancePrompt {
  title?: string | null
  prompt?: string | null
  description?: string | null
  copy_label?: string | null
  position?: number | null
}

interface ContentComponent {
  type: 'faq' | 'how_to' | 'ai_assistance'
  status?: string | null
  render_enabled?: boolean | null
  schema_enabled?: boolean | null
  data?: {
    items?: ContentFaqItem[] | null
    steps?: ContentHowToStep[] | null
    estimated_time?: string | null
    tool_items?: string[] | null
    supply_items?: string[] | null
    intro?: string | null
    collapsed?: boolean | null
    max_visible_lines?: number | null
    prompts?: ContentAiAssistancePrompt[] | null
  } | null
}

interface ContentPageSchemaInput {
  articleType: ContentArticleType
  url: string
  title: string
  description?: string | null
  imageUrl?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  datePublished?: string | null
  dateModified?: string | null
  authorName?: string | null
  articleSection?: string | null
  keywords?: string | null
  inLanguage?: string | null
  breadcrumbs: ContentBreadcrumb[]
  proficiencyLevel?: string | null
  components?: ContentComponent[] | null
  /** Publisher identity for the Organization/WebSite nodes. Defaults to KrabiClaw (the platform blog's own identity) — tenant callers must pass their own site name/logo/description so a tenant's blog post doesn't get stamped with KrabiClaw as its publisher. */
  siteName?: string | null
  siteLogoUrl?: string | null
  siteDescription?: string | null
}

function normalizeDate(value?: string | null) {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

function normalizeAbsoluteUrl(value: string, origin: string) {
  return resolveSeoUrl(value, origin)
}

function buildImageValue(url: string, width?: number | null, height?: number | null) {
  if (width && height) {
    return {
      '@type': 'ImageObject',
      url,
      width,
      height,
    }
  }

  return url
}

export function useContentPageSchema(input: MaybeRefOrGetter<ContentPageSchemaInput | null | undefined>) {
  const config = useRuntimeConfig()
  const requestURL = useRequestURL()

  useSchemaOrg(computed(() => {
    const value = toValue(input)
    if (!value?.url || !value.title) return null

    const origin = config.public.siteUrl || requestURL.origin
    const pageUrl = normalizeAbsoluteUrl(value.url, origin)
    const siteRoot = normalizeAbsoluteUrl('/', origin).replace(/\/$/, '')
    const websiteId = `${siteRoot}/#website`
    const organizationId = `${siteRoot}/#organization`
    const webpageId = `${pageUrl}#webpage`
    const articleId = `${pageUrl}#article`
    const breadcrumbId = `${pageUrl}#breadcrumb`
    const imageUrl = value.imageUrl ? normalizeAbsoluteUrl(value.imageUrl, origin) : null
    const imageValue = imageUrl ? buildImageValue(imageUrl, value.imageWidth, value.imageHeight) : null
    const components = (value.components ?? []).filter(component =>
      component.schema_enabled !== false &&
      component.render_enabled !== false &&
      (component.status === undefined || component.status === null || component.status === 'active'),
    )
    const faq = components.find(component => component.type === 'faq')
    const howTo = components.find(component => component.type === 'how_to')

    const breadcrumbItems = value.breadcrumbs
      .filter(item => item?.name && item?.url)
      .map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: normalizeAbsoluteUrl(item.url, origin),
      }))

    const webpageNode: ApiRecord = {
      '@type': 'WebPage',
      '@id': webpageId,
      url: pageUrl,
      name: value.title,
      description: value.description || undefined,
      isPartOf: { '@id': websiteId },
      breadcrumb: { '@id': breadcrumbId },
      mainEntity: { '@id': articleId },
    }

    if (imageValue) {
      webpageNode.primaryImageOfPage = imageValue
    }

    const articleNode: ApiRecord = {
      '@type': value.articleType,
      '@id': articleId,
      headline: value.title,
      description: value.description || undefined,
      url: pageUrl,
      mainEntityOfPage: { '@id': webpageId },
      publisher: { '@id': organizationId },
      isPartOf: { '@id': websiteId },
      inLanguage: value.inLanguage || 'en-US',
    }

    if (value.authorName?.trim()) {
      articleNode.author = {
        '@type': 'Person',
        name: value.authorName.trim(),
      }
    }
    if (imageValue) articleNode.image = imageValue
    if (value.articleSection?.trim()) articleNode.articleSection = value.articleSection.trim()
    if (value.keywords?.trim()) articleNode.keywords = value.keywords.trim()
    if (normalizeDate(value.datePublished)) articleNode.datePublished = normalizeDate(value.datePublished)
    if (normalizeDate(value.dateModified)) articleNode.dateModified = normalizeDate(value.dateModified)
    if (value.articleType === 'TechArticle' && value.proficiencyLevel?.trim()) {
      articleNode.proficiencyLevel = value.proficiencyLevel.trim()
    }

    const tenantPublisherFields = Boolean(value.siteName?.trim() || value.siteLogoUrl?.trim() || value.siteDescription?.trim())
    const siteName = value.siteName?.trim() || 'KrabiClaw'
    const siteLogoUrl = value.siteLogoUrl?.trim()
      ? normalizeAbsoluteUrl(value.siteLogoUrl.trim(), origin)
      : (tenantPublisherFields ? undefined : `${siteRoot}/krabi-claw-logo.png`)
    const siteDescription = value.siteDescription?.trim() || (tenantPublisherFields ? undefined : 'The AI-powered website builder for local businesses. Build your web presence through conversation with ChatGPT.')

    const graph: ApiRecord[] = [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: siteName,
        url: siteRoot,
        ...(siteLogoUrl ? { logo: siteLogoUrl } : {}),
        ...(siteDescription ? { description: siteDescription } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: siteRoot,
        name: siteName,
        ...(siteDescription ? { description: siteDescription } : {}),
        publisher: { '@id': organizationId },
      },
      webpageNode,
      articleNode,
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: breadcrumbItems,
      },
    ]

    const hasPart: Array<{ '@id': string }> = []

    if (faq?.data?.items?.length) {
      const validFaqItems = faq.data.items.filter(item => item.question?.trim() && item.answer?.trim())
      if (validFaqItems.length > 0) {
        const faqId = `${pageUrl}#faq`
        hasPart.push({ '@id': faqId })
        graph.push({
          '@type': 'FAQPage',
          '@id': faqId,
          mainEntity: validFaqItems.map(item => ({
            '@type': 'Question',
            name: item.question!.trim(),
            acceptedAnswer: {
              '@type': 'Answer',
              text: markdownToPlainText(item.answer!),
            },
          })),
        })
      }
    }

    if (howTo?.data?.steps && howTo.data.steps.length >= 2) {
      const validSteps = howTo.data.steps.filter(step => step.name?.trim() && step.text?.trim())
      if (validSteps.length >= 2) {
        const howToId = `${pageUrl}#howto`
        hasPart.push({ '@id': howToId })
        graph.push({
          '@type': 'HowTo',
          '@id': howToId,
          name: value.title,
          description: value.description || undefined,
          step: validSteps.map((step, index) => ({
            '@type': 'HowToStep',
            position: index + 1,
            name: step.name!.trim(),
            text: markdownToPlainText(step.text!),
            url: step.url ? normalizeAbsoluteUrl(step.url, origin) : undefined,
            image: step.image_public_url
              ? buildImageValue(normalizeAbsoluteUrl(step.image_public_url, origin), step.image_width, step.image_height)
              : undefined,
          })),
          totalTime: howTo.data.estimated_time || undefined,
          tool: (howTo.data.tool_items?.filter(Boolean) ?? []).map(name => ({ '@type': 'HowToTool', name })),
          supply: (howTo.data.supply_items?.filter(Boolean) ?? []).map(name => ({ '@type': 'HowToSupply', name })),
        })
      }
    }

    if (hasPart.length) {
      webpageNode.hasPart = hasPart.length === 1 ? hasPart[0] : hasPart
    }

    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    }
  }))
}
