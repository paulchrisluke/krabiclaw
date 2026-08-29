export const MEDIA_PLACEMENT_SLOTS = {
  site: ['logo', 'logo_dark', 'favicon'],
  business_location: ['hero', 'gallery'],
  product: ['image', 'gallery'],
  post: ['cover', 'gallery'],
  blog_post: ['featured'],
  experience: ['gallery'],
  offering: ['thumbnail', 'hero', 'gallery'],
  content_block: ['media', 'gallery', 'background', 'featured', 'decoration'],
  platform_doc: ['featured'],
  review: ['portrait', 'gallery'],
  review_request: ['gallery'],
  tenant_compliance: ['document'],
  chowbot_message: ['attachment'],
} as const

export type MediaPlacementOwnerType = keyof typeof MEDIA_PLACEMENT_SLOTS

export const EDITABLE_MEDIA_PLACEMENT_OWNERS = [
  'site', 'business_location', 'product', 'post', 'blog_post', 'experience',
  'offering', 'content_block', 'review', 'review_request', 'tenant_compliance',
] as const satisfies readonly MediaPlacementOwnerType[]

export type EditableMediaPlacementOwnerType = typeof EDITABLE_MEDIA_PLACEMENT_OWNERS[number]

const INDEXED_SLOTS = [
  { ownerType: 'offering', runtime: /^features\.\d+\.image$/, sqlGlob: 'features.[0-9]*.image' },
  { ownerType: 'content_block', runtime: /^items\.\d+\.image$/, sqlGlob: 'items.[0-9]*.image' },
  { ownerType: 'content_block', runtime: /^images\.\d+$/, sqlGlob: 'images.[0-9]*' },
  { ownerType: 'content_block', runtime: /^features\.\d+\.icon$/, sqlGlob: 'features.[0-9]*.icon' },
  { ownerType: 'content_block', runtime: /^people\.\d+\.image$/, sqlGlob: 'people.[0-9]*.image' },
] as const satisfies ReadonlyArray<{ ownerType: MediaPlacementOwnerType; runtime: RegExp; sqlGlob: string }>

const ORDERED_PLACEMENTS = new Set([
  'business_location:gallery', 'product:gallery', 'post:gallery', 'experience:gallery',
  'offering:gallery', 'content_block:gallery', 'review:gallery', 'review_request:gallery',
  'tenant_compliance:document',
])

export const MAX_ORDERED_MEDIA_ASSETS = 50

export function isSupportedMediaPlacement(placement: { owner_type: string; slot: string }) {
  const slots = (MEDIA_PLACEMENT_SLOTS as Record<string, readonly string[]>)[placement.owner_type]
  return slots?.includes(placement.slot) === true
    || INDEXED_SLOTS.some(pattern => pattern.ownerType === placement.owner_type && pattern.runtime.test(placement.slot))
}

export function isSingleMediaPlacement(placement: { owner_type: string; slot: string }) {
  return isSupportedMediaPlacement(placement) && !ORDERED_PLACEMENTS.has(`${placement.owner_type}:${placement.slot}`)
}
