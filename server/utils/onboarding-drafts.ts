import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import type { SiteVertical } from '~/utils/vertical-copy'
import { queryFirst } from '~/server/db'
import type { PlaceDetails, PlaceReview } from '~/server/utils/google-places'
import type { CurrencyCode } from '~/shared/currencies'
import type { PriceInput } from '~/shared/prices'
import { heroBlockSection, type TenantPageBlock, type TenantPageType } from '~/utils/tenant-page-blocks'
import { composePostalAddress } from '~/utils/postal-address'

type DraftSourceType = 'google_places' | 'manual'

export interface DraftBrandInput {
  brandColor: string | null
  logoNote: string | null
  logoPreviewUrl: string | null
  heroPhotoNote: string | null
  heroPreviewUrl: string | null
  heroHeadline: string | null
  heroSubtitle: string | null
  logoImage: DraftUploadedImage | null
  heroImage: DraftUploadedImage | null
}

export interface DraftUploadedImage {
  draftAssetId: string
  cloudflareImageId: string
  publicUrl: string
  thumbnailUrl: string | null
  mimeType: string | null
  fileName: string | null
  fileSize: number | null
}

export interface DraftLocationRecord {
  id: string
  slug: string
  title: string
  city: string | null
  address: string | null
  description: string | null
  phone: string | null
  website_url: string | null
  opening_hours: OpeningHours
  special_hours: SpecialHours
  rating: number | null
  review_count: number | null
  status: 'active'
}

export interface DraftProductRecord {
  id: string
  location_id: string
  category: string
  name: string
  slug: string
  description: string
  /** Absent when the owner has not priced this yet: no `prices` row is written. */
  price: PriceInput | null
  order_url: string | null
  is_visible: boolean
  available: boolean
  featured: boolean
  featured_sort_order: number
  sort_order: number
  tags: string[]
  details: Array<{ key: string; label: string; values: string[] }>
  source: 'import'
}

export interface DraftReviewRecord extends PlaceReview {
  id: string
  title: string | null
  owner_reply: string | null
  owner_reply_at: string | null
  source: string | null
  created_at: string | null
}

export interface DraftQaRecord {
  id: string
  question: string
  answer: string
  answer_author: string
  sort_order: number
}

export interface DraftPostRecord {
  id: string
  title: string
  body: string
  status: 'published'
  published_at: string
}

export interface DraftContentRecord {
  page: string
  field: string
  content: string | null
  value: string | null
  type: string
  hero_title: string | null
  hero_subtitle: string | null
  updated_at: string
  // Not populated by this module's own parser today (no draft content record
  // carries a resolved media asset yet) — declared so commit.post.ts's
  // per-field image-block attachment logic, which already treats it as
  // possibly absent, type-checks against the real shape it reads.
  id?: string
  asset_id?: string | null
}

export interface OnboardingDraftPayload {
  version: 2
  source: {
    type: DraftSourceType
    place: PlaceDetailsSnapshot | null
    details: DraftDetailsInput
  }
  preview: {
    brandName: string
    vertical: SiteVertical
    subdomainCandidate: string
    config: Record<string, string | null>
    media: Array<{ slot: 'logo' | 'hero'; asset: DraftUploadedImage }>
    locations: DraftLocationRecord[]
    products: DraftProductRecord[]
    reviews: DraftReviewRecord[]
    qa: DraftQaRecord[]
    posts: DraftPostRecord[]
    content: DraftContentRecord[]
    locales: Array<{ code: string; label: string; is_source: boolean }>
    hasExperiences: boolean
  }
}

function defaultProductCategory(vertical: SiteVertical): string {
  if (vertical === 'experience') return 'Experiences'
  if (vertical === 'service') return 'Services'
  return 'Menu'
}

export function onboardingPagePath(page: string): string {
  if (page === 'home') return '/'
  if (page === 'privacy') return '/policies/privacy'
  if (page === 'terms') return '/policies/terms'
  return `/${page}`
}

export function onboardingPageType(page: string): TenantPageType {
  if (page === 'privacy' || page === 'terms') return 'legal'
  if (page === 'home' || page === 'about' || page === 'contact') return 'system'
  return 'recipe'
}

// One mapping from draft content rows to tenant-page blocks. The draft preview
// renders these blocks and commit persists them, so the preview is exactly the
// page the tenant will get.
export function onboardingPageBlocks(rows: DraftContentRecord[]): TenantPageBlock[] {
  const blocks: TenantPageBlock[] = []
  for (const row of rows) {
    if (row.field === 'hero') {
      // `hero_title` is the only source of a hero's headline: buildDraftContent
      // writes the owner's answer there and leaves `content` null on that row.
      blocks.push({ id: row.id ?? crypto.randomUUID(), type: 'hero', position: blocks.length, data: { section: heroBlockSection(onboardingPagePath(row.page)), title: row.hero_title, subtitle: row.hero_subtitle }, media: [] })
    } else if (row.type === 'media' || row.field.endsWith('.image')) {
      if (row.asset_id) {
        const type = row.field.endsWith('.image') ? 'image' : 'gallery'
        blocks.push({ id: row.id ?? crypto.randomUUID(), type, position: blocks.length, data: { field: row.field }, media: [] })
      }
    } else if (row.content?.trim()) {
      const type = row.field.endsWith('.title') || row.field.endsWith('.headline') ? 'heading' : 'markdown'
      blocks.push({ id: row.id ?? crypto.randomUUID(), type, position: blocks.length, data: type === 'heading' ? { field: row.field, text: row.content, level: 2 } : { field: row.field, markdown: row.content }, media: [] })
    }
  }
  return blocks
}

export function getDraftMedia(payload: OnboardingDraftPayload, slot: 'logo' | 'hero') {
  return payload.preview.media.find(item => item.slot === slot)?.asset ?? null
}

export interface OnboardingDraftUpsertResult {
  id: string
  subdomainCandidate: string
  organizationId: string | null
  payload: OnboardingDraftPayload
}

export interface DraftDetailsInput {
  name: string
  /**
   * The address one field per answer, never the composed line. The draft used
   * to persist only the composed line, and resume read it straight back into
   * the street field — so an owner returning to a saved draft found their
   * street address reading "United States". The line a location stores is
   * derived here by composePostalAddress().
   */
  streetAddress: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  /**
   * ISO 3166-1 alpha-2, as the owner answered it on the location step. Stored
   * in its own right rather than read back off the phone number: the location
   * step saves before the contact step, so a resumed draft would otherwise fall
   * back to the product default and validate a non-US number against the US
   * numbering plan.
   */
  country: string | null
  phone: string | null
  websiteUrl: string | null
  openingHours: OpeningHours
  specialHours: SpecialHours
  notificationPhone: string | null
  timezone: string | null
  currency: CurrencyCode | null
}

export interface PlaceDetailsSnapshot {
  placeId: string
  name: string
  formattedAddress: string
  city: string | null
  phone: string | null
  mapsUrl: string | null
  websiteUrl: string | null
  rating: number | null
  ratingCount: number | null
  openingHours: OpeningHours
  timezone: string | null
  reviews: PlaceReview[]
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

function nowIso() {
  return new Date().toISOString()
}

type DraftPlaceSource = PlaceDetails | PlaceDetailsSnapshot

function asPlaceSnapshot(place: DraftPlaceSource): PlaceDetailsSnapshot {
  return {
    placeId: place.placeId,
    name: place.name,
    formattedAddress: place.formattedAddress,
    city: place.city ?? null,
    phone: place.phone ?? null,
    mapsUrl: place.mapsUrl ?? null,
    websiteUrl: place.websiteUrl ?? null,
    rating: place.rating ?? null,
    ratingCount: place.ratingCount ?? null,
    openingHours: place.openingHours ?? null,
    timezone: place.timezone,
    reviews: place.reviews,
  }
}

function buildDraftContent(
  _brandName: string,
  _vertical: SiteVertical,
  heroHeadline: string | null,
  heroSubtitle: string | null,
): DraftContentRecord[] {
  if (!heroHeadline && !heroSubtitle) return []
  return [{
    page: 'home',
    field: 'hero',
    content: null,
    value: null,
    type: 'text',
    hero_title: heroHeadline,
    hero_subtitle: heroSubtitle,
    updated_at: nowIso(),
  }]
}

/** What the owner typed on the products step, before it becomes a draft row. */
export interface DraftProductInput {
  name: string
  category: string
  /** null when the owner left the price blank. `products` requires no price. */
  amountMinor: number | null
}

export function buildOnboardingDraftPayload(input: {
  name: string
  vertical: SiteVertical
  details: DraftDetailsInput
  place: DraftPlaceSource | null
  brandDraft?: DraftBrandInput | null
  products?: DraftProductInput[] | null
}): OnboardingDraftPayload {
  const brandName = input.details.name || input.name
  const subdomainCandidate = slugify(brandName).slice(0, 40)
  const placeSnapshot = input.place ? asPlaceSnapshot(input.place) : null
  // No stock photo fallback here: a generic stock image isn't actually theirs, and the
  // Saya hero renders a brand-color + icon treatment when no real photo is available yet.
  const uploadedHero = input.brandDraft?.heroImage ?? null
  const uploadedLogo = input.brandDraft?.logoImage ?? null
  const locationSlug = slugify(brandName) || 'main'
  const locationId = 'draft-location-main'

  const description = null
  // A product the owner named on the products step. The category is the row's
  // own, not a default: applyOnboardingDraftToSite creates the category when it
  // does not exist, and an unnamed one groups under the vertical's own word for
  // "everything else". A blank price stays absent — `prices` is a separate
  // table and nothing in `products` requires a row in it, so a zero or
  // defaulted amount would be a price the owner never named.
  const products: DraftProductRecord[] = (input.products ?? []).map((product, index) => {
    const name = product.name.trim()
    const category = product.category.trim() || defaultProductCategory(input.vertical)
    return {
      id: `draft-product-${slugify(name) || index}`,
      location_id: locationId,
      category,
      name,
      slug: slugify(name) || `item-${index + 1}`,
      description: '',
      price: product.amountMinor === null
        ? null
        : { amount_minor: product.amountMinor, currency: input.details.currency ?? undefined },
      order_url: null,
      is_visible: true,
      available: true,
      featured: false,
      featured_sort_order: 0,
      sort_order: index,
      tags: [],
      details: [],
      source: 'import' as const,
    }
  })

  const reviews = (placeSnapshot?.reviews ?? []).map(review => ({
    ...review,
    id: `draft-review-${review.google_review_id.replace(/\//g, '-')}`,
    title: null, owner_reply: null, owner_reply_at: null,
    source: 'google_places', created_at: review.original_review_date,
  }))

  const qa: DraftQaRecord[] = []
  const posts: DraftPostRecord[] = []

  const brandColor = input.brandDraft?.brandColor?.trim() || null
  const heroHeadline = input.brandDraft?.heroHeadline?.trim() || null
  const heroSubtitle = input.brandDraft?.heroSubtitle?.trim() || null
  const content = buildDraftContent(brandName, input.vertical, heroHeadline, heroSubtitle)

  return {
    version: 2,
    source: {
      type: placeSnapshot ? 'google_places' : 'manual',
      place: placeSnapshot,
      details: input.details,
    },
    preview: {
      brandName,
      vertical: input.vertical,
      subdomainCandidate,
      config: {
        brand_color: brandColor,
        draft_logo_note: input.brandDraft?.logoNote?.trim() || null,
        draft_hero_photo_note: input.brandDraft?.heroPhotoNote?.trim() || null,
        draft_hero_headline: heroHeadline,
        draft_hero_subtitle: heroSubtitle,
      },
      media: [
        ...(uploadedLogo ? [{ slot: 'logo' as const, asset: uploadedLogo }] : []),
        ...(uploadedHero ? [{ slot: 'hero' as const, asset: uploadedHero }] : []),
      ],
      locations: [{
        id: locationId,
        slug: locationSlug,
        title: brandName,
        city: input.details.city ?? placeSnapshot?.city ?? null,
        address: composePostalAddress({
          streetAddress: input.details.streetAddress ?? '',
          addressLine2: input.details.addressLine2 ?? '',
          city: input.details.city ?? '',
          region: input.details.region ?? '',
          postalCode: input.details.postalCode ?? '',
          country: input.details.country ?? '',
          streetIsFormatted: placeSnapshot !== null,
        }) || null,
        description,
        phone: input.details.phone ?? placeSnapshot?.phone ?? null,
        website_url: input.details.websiteUrl ?? placeSnapshot?.websiteUrl ?? null,
        opening_hours: input.details.openingHours,
        special_hours: input.details.specialHours,
        rating: placeSnapshot?.rating ?? null,
        review_count: placeSnapshot?.ratingCount ?? null,

      status: 'active',
      }],
      products,
      reviews,
      qa,
      posts,
      content,
      locales: [{ code: 'en', label: 'English', is_source: true }],
      hasExperiences: input.vertical === 'experience',
    },
  }
}

export function parseOnboardingDraftPayload(raw: string): OnboardingDraftPayload {
  const parsed = JSON.parse(raw) as OnboardingDraftPayload
  if (!parsed || parsed.version !== 2 || !parsed.preview || !Array.isArray(parsed.preview.media) || !Array.isArray(parsed.preview.products)) {
    throw new Error('Unsupported onboarding draft payload')
  }
  parsed.source.details.openingHours = parseOpeningHours(parsed.source.details.openingHours)
  parsed.source.details.specialHours = parseSpecialHours(parsed.source.details.specialHours)
  if (parsed.source.place) parsed.source.place.openingHours = parseOpeningHours(parsed.source.place.openingHours)
  for (const location of parsed.preview.locations) {
    location.opening_hours = parseOpeningHours(location.opening_hours)
    location.special_hours = parseSpecialHours(location.special_hours)
  }
  return parsed
}

export async function upsertActiveOnboardingDraft(db: D1Database, input: {
  userId: string
  organizationId?: string | null
  name: string
  vertical: SiteVertical
  sourceType: DraftSourceType
  payload: OnboardingDraftPayload
}): Promise<OnboardingDraftUpsertResult> {
  const payloadJson = JSON.stringify(input.payload)
  const now = nowIso()

  const id = crypto.randomUUID()
  // The address is claimed at the first save, when the pending site is created,
  // so a later change of brand name renames the brand and not the site's host —
  // and every following save keeps writing to the same site. organization_id is
  // set once for the same reason.
  const draft = await queryFirst<{ id: string; subdomain_candidate: string; organization_id: string | null }>(db, `
    INSERT INTO onboarding_drafts
      (id, user_id, organization_id, name, vertical, subdomain_candidate, source_type, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(user_id) WHERE status = 'active'
    DO UPDATE SET
      organization_id = COALESCE(onboarding_drafts.organization_id, excluded.organization_id),
      name = excluded.name,
      vertical = excluded.vertical,
      source_type = excluded.source_type,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
    RETURNING id, subdomain_candidate, organization_id
  `, [
    id,
    input.userId,
    input.organizationId ?? null,
    input.name,
    input.vertical,
    input.payload.preview.subdomainCandidate,
    input.sourceType,
    payloadJson,
    now,
    now,
  ])
  if (!draft?.id) {
    throw new Error('Failed to save active onboarding draft')
  }

  return {
    id: draft.id,
    subdomainCandidate: draft.subdomain_candidate,
    organizationId: draft.organization_id,
    payload: input.payload,
  }
}
