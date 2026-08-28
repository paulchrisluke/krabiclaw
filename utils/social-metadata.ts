/**
 * Shared global OG/social SEO contract (#259).
 *
 * This is the single normalized payload every page — platform marketing, Saya tenant,
 * Blawby tenant, and future templates — feeds into `composeSocialMetadata()` to get a
 * complete, guaranteed set of `<title>`, meta description, canonical link, Open Graph,
 * and Twitter tags. Routes/composables provide data to this contract; they must not
 * assemble independent tag sets or image URLs themselves.
 *
 * `useSocialMetadata` is the only adapter over this contract and resolves both
 * platform and tenant origins before applying the normalized tags.
 */

/** Registered render templates. Keep in sync with server/utils/og-image/renderers/index.ts. */
export type SocialTemplate = 'platform' | 'saya' | 'blawby'

export type SocialPageType = 'website' | 'article' | 'profile'

/** Matches useSeoMeta's ogImageType/twitterImage MIME union. */
export type SocialImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif'

export interface SocialImageSource {
  url: string
  width?: number
  height?: number
  type?: SocialImageMimeType
  alt?: string
}

export interface SocialMediaSource {
  kind?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
}

function firstNonBlank(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return null
}

export function resolveSocialImageUrl(source: SocialMediaSource | null | undefined): string | null {
  if (source?.kind === 'video') {
    const thumbnailUrl = firstNonBlank(source.thumbnail_url)
    if (!thumbnailUrl) throw new Error('Video media requires a thumbnail URL')
    return thumbnailUrl
  }
  return source?.kind === 'image' || !source?.kind
    ? firstNonBlank(source?.public_url)
    : null
}

export interface SocialBrand {
  /** og:site_name. */
  siteName: string
  logoUrl?: string | null
  faviconUrl?: string | null
}

export interface SocialPageMetadataInput {
  template: SocialTemplate
  pageType?: SocialPageType
  title: string
  /** Full-length description; composer truncates to platform-appropriate lengths. */
  description?: string | null
  /** Absolute or root-relative path/URL; resolved against the correct origin by the adapter. */
  canonicalUrl: string
  brand: SocialBrand
  /**
   * The already-generated, already-persisted OG card for this page — resolved and rendered at
   * publish time (server/utils/social-image-resolver.ts + server/utils/social-image/generate.ts,
   * issue #685), never at page-view/crawl time. Required: every public page has one by the time
   * it can be published; there is no gradient/placeholder fallback here.
   */
  socialImage: SocialImageSource
  /** Short eyebrow/category shown on the generated card (e.g. "Service", "Blog"). */
  label?: string | null
  location?: string | null
  author?: string | null
  /** ISO 8601 date string. Only meaningful when pageType is 'article'. */
  publishedAt?: string | null
  /** Defaults to true. Set false for pages that should not be indexed. */
  indexable?: boolean
  /** Explicit robots override string; takes precedence over `indexable` when set. */
  robots?: string | null
}

export interface ComposedSocialTags {
  title: string
  description: string | undefined
  canonicalUrl: string
  robots: string | null
  ogTitle: string
  ogDescription: string | undefined
  ogType: SocialPageType
  ogUrl: string
  ogSiteName: string
  ogImage: string
  ogImageWidth: number | undefined
  ogImageHeight: number | undefined
  ogImageType: SocialImageMimeType | undefined
  ogImageAlt: string
  twitterCard: 'summary_large_image'
  twitterTitle: string
  twitterDescription: string | undefined
  twitterImage: string
  twitterImageAlt: string
  /** Only set when pageType is 'article' and the corresponding input field is present. */
  articleAuthor: string[] | undefined
  articlePublishedTime: string | undefined
}

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

const TITLE_MAX_LENGTH = 70
const DESCRIPTION_MAX_LENGTH = 160

/** Truncate text to fit social/SERP preview limits, breaking on a word boundary. */
export function truncateForSeo(text: string | null | undefined, maxLength: number): string | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`
}

export function resolveRobots(input: Pick<SocialPageMetadataInput, 'robots' | 'indexable'>): string | null {
  if (input.robots) return input.robots
  if (input.indexable === false) return 'noindex, nofollow'
  return null
}

/**
 * Pure composer: turns the shared contract into the exact tag set every page must emit.
 * Does not touch Vue/Nuxt APIs — composables/useSocialMetadata.ts applies this output via
 * useHead so the same logic is testable without a component context.
 */
export function composeSocialMetadata(
  input: SocialPageMetadataInput,
  resolvedOgImage: SocialImageSource,
): ComposedSocialTags {
  const title = truncateForSeo(input.title, TITLE_MAX_LENGTH) || input.title
  const description = truncateForSeo(input.description, DESCRIPTION_MAX_LENGTH)
  const pageType = input.pageType || 'website'
  const alt = resolvedOgImage.alt || input.title

  return {
    title,
    description,
    canonicalUrl: input.canonicalUrl,
    robots: resolveRobots(input),
    ogTitle: title,
    ogDescription: description,
    ogType: pageType,
    ogUrl: input.canonicalUrl,
    ogSiteName: input.brand.siteName,
    ogImage: resolvedOgImage.url,
    ogImageWidth: resolvedOgImage.width,
    ogImageHeight: resolvedOgImage.height,
    ogImageType: resolvedOgImage.type,
    ogImageAlt: alt,
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: resolvedOgImage.url,
    twitterImageAlt: alt,
    articleAuthor: pageType === 'article' && input.author ? [input.author] : undefined,
    articlePublishedTime: pageType === 'article' && input.publishedAt ? input.publishedAt : undefined,
  }
}

/** Payload server/utils/social-image/generate.ts's compositor consumes to render one OG card.
 * Kept separate from the page-level SocialPageMetadataInput because it only carries what the
 * visual renderer needs, and is only ever built server-side at publish time — never from a
 * request's query string, since there is no request-time render route anymore (issue #685). */
export interface OgImageRenderPayload {
  template: SocialTemplate
  title: string
  description?: string | null
  siteName: string
  label?: string | null
  location?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  backgroundImageUrl: string
}
