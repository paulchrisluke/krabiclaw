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
  kind?: 'image' | 'video'
  thumbnailUrl?: string | null
  width?: number
  height?: number
  type?: SocialImageMimeType
  alt?: string
}

export interface SocialMediaSource {
  kind?: string | null
  url?: string | null
  public_url?: string | null
  thumbnailUrl?: string | null
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
    const thumbnailUrl = firstNonBlank(source.thumbnailUrl, source.thumbnail_url)
    if (!thumbnailUrl) throw new Error('Video media requires a thumbnail URL')
    return thumbnailUrl
  }
  return source?.kind === 'image' || !source?.kind
    ? firstNonBlank(source?.url, source?.public_url)
    : null
}

export interface SocialBrand {
  /** og:site_name and the name rendered on generated OG image cards. */
  siteName: string
  logoUrl?: string | null
  /** Square icon (favicon) — preferred over logoUrl for the small brand mark on generated
   * OG cards, since logoUrl is often a non-square wordmark that distorts when forced into
   * a square slot. Falls back to logoUrl when unset. */
  faviconUrl?: string | null
  /** Hex color, e.g. '#0f172a'. Used as the generated-card background/accent. */
  primaryColor?: string | null
  secondaryColor?: string | null
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
  /** A real photo to feature (article hero, offering photo, location photo). */
  heroImage?: SocialImageSource | null
  /** Short eyebrow/category shown on the generated card (e.g. "Service", "Blog"). */
  label?: string | null
  location?: string | null
  author?: string | null
  /** ISO 8601 date string. Only meaningful when pageType is 'article'. */
  publishedAt?: string | null
  /** Defaults to true. Set false for draft/unpublished/noindex pages. */
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

/** Deterministic SHA-256 key shared by browser URL generation and server KV lookup. */
export function hashOgImagePayload(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)))
}

/** Payload the OG image render route/pipeline consumes. Kept separate from the page-level
 * SocialPageMetadataInput because it only carries what the visual renderer needs. */
export interface OgImageRenderPayload {
  template: SocialTemplate
  title: string
  description?: string | null
  siteName: string
  label?: string | null
  location?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  backgroundImageUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
}

// Root-level (not under /api/) — @nuxt/robots disallows crawler access to /api/** by
// default, and this route must stay fetchable by social-platform crawlers.
const OG_IMAGE_ROUTE = '/og-image-render.png'

function buildOgImageQueryParams(payload: OgImageRenderPayload): URLSearchParams {
  const params = new URLSearchParams()
  params.set('template', payload.template)
  params.set('title', payload.title)
  if (payload.description) params.set('description', payload.description)
  params.set('siteName', payload.siteName)
  if (payload.label) params.set('label', payload.label)
  if (payload.location) params.set('location', payload.location)
  if (payload.logoUrl && payload.logoUrl.startsWith('https://')) params.set('logoUrl', payload.logoUrl)
  if (payload.faviconUrl && payload.faviconUrl.startsWith('https://')) params.set('faviconUrl', payload.faviconUrl)
  if (payload.backgroundImageUrl && payload.backgroundImageUrl.startsWith('https://')) params.set('backgroundImageUrl', payload.backgroundImageUrl)
  if (payload.primaryColor) params.set('primaryColor', payload.primaryColor)
  if (payload.secondaryColor) params.set('secondaryColor', payload.secondaryColor)
  // Sort so the query string — and therefore the cache key — is stable regardless of
  // insertion order.
  params.sort()
  return params
}

/** Cache key shared between the render route's KV lookup and the URL's own querystring. */
export function computeOgImageCacheKey(payload: OgImageRenderPayload): string {
  return hashOgImagePayload(buildOgImageQueryParams(payload).toString())
}

/** Builds the absolute URL to the dynamic OG image render route for a given payload. */
export function buildOgImageUrl(origin: string, payload: OgImageRenderPayload): string {
  const params = buildOgImageQueryParams(payload)
  const key = hashOgImagePayload(params.toString())
  params.set('k', key)
  return new URL(`${OG_IMAGE_ROUTE}?${params.toString()}`, origin).toString()
}

/** Every page gets a template-aware generated 1200×630 card. Media is composited as
 * background input; no raw asset can bypass the title/description/brand renderer. */
export function resolveSocialOgImage(input: SocialPageMetadataInput, origin: string): SocialImageSource {
  const renderPayload: OgImageRenderPayload = {
    template: input.template,
    title: input.title,
    description: truncateForSeo(input.description, DESCRIPTION_MAX_LENGTH),
    siteName: input.brand.siteName,
    label: input.label,
    location: input.location,
    logoUrl: input.brand.logoUrl,
    faviconUrl: input.brand.faviconUrl,
    backgroundImageUrl: resolveSocialImageUrl(input.heroImage),
    primaryColor: input.brand.primaryColor,
    secondaryColor: input.brand.secondaryColor,
  }

  return {
    url: buildOgImageUrl(origin, renderPayload),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    type: 'image/png',
    alt: input.title,
  }
}

// This route is public/unauthenticated (social-platform crawlers hit it directly), so
// these caps bound the cost of processing a crafted, oversized query string before any
// rendering work starts — independent of buildOgImageCard's own display-length clipping,
// which only bounds what gets laid out, not what gets read/trimmed off the query first.
const MAX_QUERY_TEXT_LENGTH = 500
const MAX_QUERY_URL_LENGTH = 2000

/** Server-side counterpart: parses the render route's query string back into a payload. */
export function parseOgImageQuery(query: Record<string, string | string[] | undefined>): OgImageRenderPayload {
  const get = (key: string, maxLength = MAX_QUERY_TEXT_LENGTH): string | undefined => {
    const value = query[key]
    const raw = Array.isArray(value) ? value[0] : value
    return raw ? raw.slice(0, maxLength) : raw
  }
  const template = get('template')
  const title = get('title')?.trim()
  const siteName = get('siteName')?.trim()
  if (template !== 'platform' && template !== 'saya' && template !== 'blawby') {
    throw new Error('OG image template is required')
  }
  if (!title) throw new Error('OG image title is required')
  if (!siteName) throw new Error('OG image site name is required')
  return {
    template,
    title,
    description: get('description') || null,
    siteName,
    label: get('label') || null,
    location: get('location') || null,
    logoUrl: get('logoUrl', MAX_QUERY_URL_LENGTH) || null,
    faviconUrl: get('faviconUrl', MAX_QUERY_URL_LENGTH) || null,
    backgroundImageUrl: get('backgroundImageUrl', MAX_QUERY_URL_LENGTH) || null,
    primaryColor: get('primaryColor') || null,
    secondaryColor: get('secondaryColor') || null,
  }
}
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
