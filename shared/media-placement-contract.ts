export const MEDIA_PLACEMENT_SLOTS = {
  site: ['logo', 'logo_dark', 'favicon', 'social_share', 'social_card', 'compliance_document'],
  business_location: ['hero', 'gallery', 'social_card'],
  product: ['image', 'gallery', 'social_card'],
  content_document: ['cover', 'gallery', 'social_card'],
  content_block: ['media', 'gallery', 'background', 'featured', 'decoration'],
  review: ['portrait', 'gallery', 'social_card'],
  review_request: ['gallery'],
} as const

export type MediaPlacementOwnerType = keyof typeof MEDIA_PLACEMENT_SLOTS

export const EDITABLE_MEDIA_PLACEMENT_OWNERS = [
  'site', 'business_location', 'product', 'content_document',
  'content_block', 'review_request',
] as const satisfies readonly MediaPlacementOwnerType[]

export type EditableMediaPlacementOwnerType = typeof EDITABLE_MEDIA_PLACEMENT_OWNERS[number]

export function isMediaPlacementOwnerType(value: string): value is MediaPlacementOwnerType {
  return Object.hasOwn(MEDIA_PLACEMENT_SLOTS, value)
}

export function isEditableMediaPlacementOwnerType(value: string): value is EditableMediaPlacementOwnerType {
  return EDITABLE_MEDIA_PLACEMENT_OWNERS.some(ownerType => ownerType === value)
}

const INDEXED_SLOTS = [
  { ownerType: 'content_block', runtime: /^items\.\d+\.image$/, sqlGlob: 'items.[0-9]*.image' },
  { ownerType: 'content_block', runtime: /^images\.\d+$/, sqlGlob: 'images.[0-9]*' },
  { ownerType: 'content_block', runtime: /^features\.\d+\.icon$/, sqlGlob: 'features.[0-9]*.icon' },
  { ownerType: 'content_block', runtime: /^people\.\d+\.image$/, sqlGlob: 'people.[0-9]*.image' },
] as const satisfies ReadonlyArray<{ ownerType: MediaPlacementOwnerType; runtime: RegExp; sqlGlob: string }>

const ORDERED_PLACEMENTS = new Set([
  'business_location:gallery', 'product:gallery', 'content_document:gallery',
  'content_block:gallery', 'review:gallery', 'review_request:gallery',
  'site:compliance_document',
])

/**
 * What a picture or video shows. One list, because it was previously written out
 * in four places — the column's `$type`, the media manager's own union, and the
 * MCP tool's JSON schema twice — and the column itself had no constraint at all,
 * so any string a writer invented was stored. `media_assets_category_check`
 * holds the same set in SQL, which is the database's own copy of it.
 *
 * Which of these a business is *offered* is a separate question, answered per
 * vertical in `utils/product-presentation.ts`: a law firm is not shown Food.
 */
export const MEDIA_CATEGORIES = [
  'exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog',
] as const

export type MediaCategory = typeof MEDIA_CATEGORIES[number]

/**
 * The subjects a writer may set. `logo` and `blog` are assigned by the surfaces
 * that own those pictures, never chosen as a subject.
 */
export const WRITABLE_MEDIA_CATEGORIES = [
  'exterior', 'interior', 'food', 'menu', 'team', 'other',
] as const satisfies readonly MediaCategory[]

export function isMediaCategory(value: unknown): value is MediaCategory {
  return typeof value === 'string' && (MEDIA_CATEGORIES as readonly string[]).includes(value)
}

export const MAX_ORDERED_MEDIA_ASSETS = 50

export function isSupportedMediaPlacement(placement: { owner_type: string; slot: string }) {
  const slots = isMediaPlacementOwnerType(placement.owner_type)
    ? MEDIA_PLACEMENT_SLOTS[placement.owner_type]
    : undefined
  return slots?.some(slot => slot === placement.slot) === true
    || INDEXED_SLOTS.some(pattern => pattern.ownerType === placement.owner_type && pattern.runtime.test(placement.slot))
}

export function isEditableMediaPlacement(placement: { owner_type: string; slot: string }) {
  return placement.slot !== 'social_card'
    && isEditableMediaPlacementOwnerType(placement.owner_type)
    && isSupportedMediaPlacement(placement)
}

export function isSingleMediaPlacement(placement: { owner_type: string; slot: string }) {
  return isSupportedMediaPlacement(placement) && !ORDERED_PLACEMENTS.has(`${placement.owner_type}:${placement.slot}`)
}

/**
 * What a media record says about itself. `media_assets.kind` is the authority:
 * a video carries its file in `public_url` and a required poster in
 * `thumbnail_url`, an image carries itself in `public_url`.
 */
export interface MediaPresentation {
  kind?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
}

/**
 * The still picture that stands for this media — the image itself, or a
 * video's poster. Never a video file: handing an `.mp4` to an `<img>` is the
 * defect this replaces, and it reached customers in a booking email.
 *
 * A record whose `kind` is missing or unrecognised has no still. Guessing one
 * from the URL's extension, or assuming an absent kind means "image", is how
 * the disagreement stayed hidden.
 */
export function mediaStillUrl(media: MediaPresentation | null | undefined): string | null {
  if (!media) return null
  if (media.kind === 'video') return media.thumbnail_url || null
  if (media.kind === 'image') return media.public_url || null
  return null
}

/** The file a player loads. Only a video has one. */
export function mediaPlaybackUrl(media: MediaPresentation | null | undefined): string | null {
  return media?.kind === 'video' ? media.public_url || null : null
}
