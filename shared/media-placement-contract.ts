export const MEDIA_PLACEMENT_SLOTS = {
  site: ['logo', 'logo_dark', 'favicon', 'og_default', 'og_generated'],
  business_location: ['hero', 'gallery', 'og_generated'],
  product: ['image', 'gallery', 'og_generated'],
  post: ['cover', 'gallery', 'og_generated'],
  blog_post: ['featured', 'og_generated'],
  experience: ['gallery', 'og_generated'],
  offering: ['thumbnail', 'hero', 'gallery', 'og_generated'],
  content_block: ['media', 'gallery', 'background', 'featured', 'decoration'],
  platform_doc: ['featured', 'og_generated'],
  review: ['portrait', 'gallery', 'og_generated'],
  review_request: ['gallery', 'og_generated'],
  tenant_compliance: ['document'],
  chowbot_message: ['attachment'],
  platform: ['og_generated'],
  // The generic CMS page type (freeform content_block-built pages — most of a tenant site's
  // actual public routes: home, about, contact, etc.). It has no OTHER slot of its own — its
  // background photo is resolved by scanning its content blocks (see
  // server/utils/social-image-resolver.ts) — but still needs somewhere to persist its own
  // generated OG card.
  tenant_page: ['og_generated'],
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

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export const MEDIA_PLACEMENT_OWNER_CHECK_SQL = `owner_type IN (${Object.keys(MEDIA_PLACEMENT_SLOTS).map(sqlString).join(',')})`

export const MEDIA_PLACEMENT_SLOT_CHECK_SQL = Object.entries(MEDIA_PLACEMENT_SLOTS).map(([ownerType, slots]) => {
  const staticSlots = slots.length === 1
    ? `slot = ${sqlString(slots[0])}`
    : `slot IN (${slots.map(sqlString).join(',')})`
  const indexedSlots = INDEXED_SLOTS
    .filter(pattern => pattern.ownerType === ownerType)
    .map(pattern => `slot GLOB ${sqlString(pattern.sqlGlob)}`)
  return `(owner_type = ${sqlString(ownerType)} AND (${[staticSlots, ...indexedSlots].join(' OR ')}))`
}).join(' OR ')
