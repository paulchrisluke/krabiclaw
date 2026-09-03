import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSocialImageSource(value: unknown): SocialImageSource | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('Social image source requires a URL')
  }
  if (value.kind !== undefined && value.kind !== 'image' && value.kind !== 'video') {
    throw new Error('Social image source kind must be image or video')
  }
  if (value.thumbnailUrl !== undefined && value.thumbnailUrl !== null && typeof value.thumbnailUrl !== 'string') {
    throw new Error('Social image thumbnail URL must be a string or null')
  }
  if (value.width !== undefined && (typeof value.width !== 'number' || !Number.isFinite(value.width))) {
    throw new Error('Social image width must be a finite number')
  }
  if (value.height !== undefined && (typeof value.height !== 'number' || !Number.isFinite(value.height))) {
    throw new Error('Social image height must be a finite number')
  }
  if (value.type !== undefined && value.type !== 'image/jpeg' && value.type !== 'image/png' && value.type !== 'image/gif') {
    throw new Error('Social image MIME type is invalid')
  }
  if (value.alt !== undefined && typeof value.alt !== 'string') {
    throw new Error('Social image alt text must be a string')
  }
  return {
    url: value.url,
    ...(value.kind === undefined ? {} : { kind: value.kind }),
    ...(value.thumbnailUrl === undefined ? {} : { thumbnailUrl: value.thumbnailUrl }),
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.height === undefined ? {} : { height: value.height }),
    ...(value.type === undefined ? {} : { type: value.type }),
    ...(value.alt === undefined ? {} : { alt: value.alt }),
  }
}

export interface SocialMediaSource {
  slot?: string
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

function toSocialImageSource(source: SocialMediaSource | null | undefined): SocialImageSource | null {
  const url = resolveSocialImageUrl(source)
  if (!url) return null
  return {
    url,
    width: source?.slot === 'social_card' ? OG_IMAGE_WIDTH : undefined,
    height: source?.slot === 'social_card' ? OG_IMAGE_HEIGHT : undefined,
    type: source?.slot === 'social_card' ? 'image/png' : undefined,
  }
}

export function resolveSocialImageFromMedia(
  ownerMedia: readonly SocialMediaSource[],
  siteMedia: readonly SocialMediaSource[],
): SocialImageSource | null {
  const candidates = [
    ownerMedia.find(item => item.slot === 'social_card'),
    siteMedia.find(item => item.slot === 'social_card'),
    siteMedia.find(item => item.slot === 'social_share'),
    siteMedia.find(item => item.slot === 'logo'),
  ]
  for (const candidate of candidates) {
    const resolved = toSocialImageSource(candidate)
    if (resolved) return resolved
  }
  return null
}

export interface PublicSocialMedia<T extends SocialMediaSource = SocialMediaSource> {
  media: T[]
  social_image: SocialImageSource | null
}

export function publicSocialMediaFromPlacements<T extends SocialMediaSource>(
  ownerMedia: readonly T[],
  siteMedia: readonly T[],
): PublicSocialMedia<T> {
  return {
    media: ownerMedia.filter(item => item.slot !== 'social_card'),
    social_image: resolveSocialImageFromMedia(ownerMedia, siteMedia),
  }
}

export function resolvePublicSocialImage(
  ownerImage: SocialImageSource | null,
  siteImage: SocialImageSource | null,
): SocialImageSource | null {
  return ownerImage ?? siteImage
}

export interface SocialBrand {
  /** og:site_name and the name rendered on generated OG image cards. */
  siteName: string
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
  socialImage?: SocialImageSource | null
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
  ogSiteName: string | undefined
  ogImage: string | undefined
  ogImageWidth: number | undefined
  ogImageHeight: number | undefined
  ogImageType: SocialImageMimeType | undefined
  ogImageAlt: string | undefined
  twitterCard: 'summary_large_image'
  twitterTitle: string
  twitterDescription: string | undefined
  twitterImage: string | undefined
  twitterImageAlt: string | undefined
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
  resolvedOgImage: SocialImageSource | null,
): ComposedSocialTags {
  const title = truncateForSeo(input.title, TITLE_MAX_LENGTH) || input.title
  const description = truncateForSeo(input.description, DESCRIPTION_MAX_LENGTH)
  const pageType = input.pageType || 'website'
  const alt = resolvedOgImage?.alt || (resolvedOgImage ? input.title : undefined)

  return {
    title,
    description,
    canonicalUrl: input.canonicalUrl,
    robots: resolveRobots(input),
    ogTitle: title,
    ogDescription: description,
    ogType: pageType,
    ogUrl: input.canonicalUrl,
    ogSiteName: firstNonBlank(input.brand.siteName) ?? undefined,
    ogImage: resolvedOgImage?.url,
    ogImageWidth: resolvedOgImage?.width,
    ogImageHeight: resolvedOgImage?.height,
    ogImageType: resolvedOgImage?.type,
    ogImageAlt: alt,
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: resolvedOgImage?.url,
    twitterImageAlt: alt,
    articleAuthor: pageType === 'article' && input.author ? [input.author] : undefined,
    articlePublishedTime: pageType === 'article' && input.publishedAt ? input.publishedAt : undefined,
  }
}

export function hashSocialCardGenerationInput(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)))
}

export interface SocialCardRenderPayload {
  template: SocialTemplate
  title: string
  description?: string | null
  siteName: string
  label?: string | null
  location?: string | null
  logoUrl?: string | null
  backgroundImageUrl: string
}
