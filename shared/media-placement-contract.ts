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
  'content_block', 'review', 'review_request',
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
