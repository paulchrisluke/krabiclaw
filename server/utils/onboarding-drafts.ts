import type { SiteVertical } from '~/utils/vertical-copy'
import { queryFirst } from '~/server/db'
import type { PlaceDetails } from '~/server/utils/google-places'
import type { CurrencyCode } from '~/shared/currencies'

type DraftSourceType = 'google_places' | 'manual'

export interface DraftBrandInput {
  brandColor: string | null
  logoNote: string | null
  logoPreviewUrl: string | null
  heroPhotoNote: string | null
  heroPreviewUrl: string | null
  heroHeadline: string | null
  heroDescription: string | null
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
  opening_hours: string | null
  rating: number | null
  review_count: number | null
  is_primary: boolean
  status: 'active'
}

export interface DraftProductRecord {
  id: string
  location_id: string
  category: string
  name: string
  slug: string
  description: string
  price_amount: string
  compare_at_price_amount: string | null
  sale_starts_at: string | null
  sale_ends_at: string | null
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

export interface DraftReviewRecord {
  id: string
  author_name: string | null
  rating: number
  title: string | null
  content: string | null
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
  component: string | null
  updated_at: string
  // Not populated by this module's own parser today (no draft content record
  // carries a resolved media asset yet) — declared so commit.post.ts's
  // per-field image-block attachment logic, which already treats it as
  // possibly absent, type-checks against the real shape it reads.
  id?: string
  asset_id?: string | null
}

export interface OnboardingDraftPayload {
  version: 1
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

export function getDraftMedia(payload: OnboardingDraftPayload, slot: 'logo' | 'hero') {
  return payload.preview.media.find(item => item.slot === slot)?.asset ?? null
}

export interface OnboardingDraftUpsertResult {
  id: string
  subdomainCandidate: string
  payload: OnboardingDraftPayload
}

export interface DraftDetailsInput {
  name: string
  city: string | null
  address: string | null
  phone: string | null
  websiteUrl: string | null
  openingHours: string | null
  notificationPhone: string | null
  timezone: string | null
  currency: CurrencyCode
  isPrimary: boolean
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
  openingHours: string[] | null
  reviews: Array<{
    reviewId: string | null
    authorName: string | null
    rating: number | null
    text: string | null
    publishedAt: string | null
  }>
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
    reviews: place.reviews.map(review => ({
      reviewId: review.reviewId ?? null,
      authorName: review.authorName ?? null,
      rating: review.rating ?? null,
      text: review.text ?? null,
      publishedAt: review.publishedAt ?? null,
    })),
  }
}

function buildDraftContent(
  _brandName: string,
  _vertical: SiteVertical,
  heroHeadline: string | null,
  heroDescription: string | null,
): DraftContentRecord[] {
  if (!heroHeadline && !heroDescription) return []
  return [{
    page: 'home',
    field: 'hero',
    content: null,
    value: null,
    type: 'text',
    hero_title: heroHeadline,
    hero_subtitle: heroDescription,
    component: null,
    updated_at: nowIso(),
  }]
}

export function buildOnboardingDraftPayload(input: {
  name: string
  vertical: SiteVertical
  details: DraftDetailsInput
  place: DraftPlaceSource | null
  brandDraft?: DraftBrandInput | null
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
  const products: DraftProductRecord[] = []

  const reviews = (placeSnapshot?.reviews ?? [])
    .filter(review => typeof review.rating === 'number' && review.rating > 0)
    .map((review, index) => ({
      id: review.reviewId ? `draft-review-${review.reviewId.replace(/\//g, '-')}` : `draft-review-${index + 1}`,
      author_name: review.authorName,
      rating: review.rating ?? 0,
      title: null,
      content: review.text,
      owner_reply: null,
      owner_reply_at: null,
      source: 'google_places',
      created_at: review.publishedAt,
    }))

  const qa: DraftQaRecord[] = []
  const posts: DraftPostRecord[] = []

  const brandColor = input.brandDraft?.brandColor?.trim() || null
  const heroHeadline = input.brandDraft?.heroHeadline?.trim() || null
  const heroDescription = input.brandDraft?.heroDescription?.trim() || null
  const content = buildDraftContent(brandName, input.vertical, heroHeadline, heroDescription)

  return {
    version: 1,
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
        source_locale: 'en',
        brand_color: brandColor,
        draft_logo_note: input.brandDraft?.logoNote?.trim() || null,
        draft_hero_photo_note: input.brandDraft?.heroPhotoNote?.trim() || null,
        draft_hero_headline: heroHeadline,
        draft_hero_description: heroDescription,
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
        address: input.details.address ?? placeSnapshot?.formattedAddress ?? null,
        description,
        phone: input.details.phone ?? placeSnapshot?.phone ?? null,
        website_url: input.details.websiteUrl ?? placeSnapshot?.websiteUrl ?? null,
        opening_hours: input.details.openingHours ?? (placeSnapshot?.openingHours ? placeSnapshot.openingHours.join('\n') : null),
        rating: placeSnapshot?.rating ?? null,
        review_count: placeSnapshot?.ratingCount ?? null,
        is_primary: true,
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
  if (!parsed || parsed.version !== 1 || !parsed.preview || !Array.isArray(parsed.preview.media) || !Array.isArray(parsed.preview.products)) {
    throw new Error('Unsupported onboarding draft payload')
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
  const subdomainCandidate = input.payload.preview.subdomainCandidate
  const now = nowIso()

  const id = crypto.randomUUID()
  const draft = await queryFirst<{ id: string }>(db, `
    INSERT INTO onboarding_drafts
      (id, user_id, organization_id, name, vertical, subdomain_candidate, source_type, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(user_id) WHERE status = 'active'
    DO UPDATE SET
      organization_id = excluded.organization_id,
      name = excluded.name,
      vertical = excluded.vertical,
      subdomain_candidate = excluded.subdomain_candidate,
      source_type = excluded.source_type,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
    RETURNING id
  `, [
    id,
    input.userId,
    input.organizationId ?? null,
    input.name,
    input.vertical,
    subdomainCandidate,
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
    subdomainCandidate,
    payload: input.payload,
  }
}
