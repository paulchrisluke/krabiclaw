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
  category: 'logo' | 'other'
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
  hero_url: string | null
  thumbnail_url: string | null
}

export interface DraftMenuItemRecord {
  id: string
  section: string
  name: string
  slug: string
  description: string
  price_amount: number
  available: boolean
  sort_order: number
}

export interface DraftMenuRecord {
  id: string
  name: string
  status: 'published'
  items: DraftMenuItemRecord[]
}

export interface DraftReviewRecord {
  id: string
  author_name: string | null
  reviewer_photo_url: string | null
  rating: number
  title: string | null
  content: string | null
  owner_reply: string | null
  owner_reply_at: string | null
  photo_urls: string | null
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
  hero_public_url: string | null
  hero_kind: string | null
  thumbnail_url: string | null
  component: string | null
  updated_at: string
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
    draftMedia: {
      logo: DraftUploadedImage | null
      hero: DraftUploadedImage | null
    }
    locations: DraftLocationRecord[]
    menu: DraftMenuRecord | null
    reviews: DraftReviewRecord[]
    qa: DraftQaRecord[]
    posts: DraftPostRecord[]
    content: DraftContentRecord[]
    locales: Array<{ code: string; label: string; is_source: boolean }>
    hasExperiences: boolean
  }
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
  photos: Array<{ photoUri: string }>
  reviews: Array<{
    reviewId: string | null
    authorName: string | null
    authorPhotoUrl: string | null
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
    photos: place.photos.map(photo => ({ photoUri: photo.photoUri })),
    reviews: place.reviews.map(review => ({
      reviewId: review.reviewId ?? null,
      authorName: review.authorName ?? null,
      authorPhotoUrl: review.authorPhotoUrl ?? null,
      rating: review.rating ?? null,
      text: review.text ?? null,
      publishedAt: review.publishedAt ?? null,
    })),
  }
}

function buildDraftContent(
  _brandName: string,
  _vertical: SiteVertical,
  heroImageUrl: string | null,
  heroThumbnailUrl: string | null,
  heroHeadline: string | null,
  heroDescription: string | null,
): DraftContentRecord[] {
  if (!heroHeadline && !heroDescription && !heroImageUrl) return []
  return [{
    page: 'home',
    field: 'hero',
    content: null,
    value: null,
    type: 'text',
    hero_title: heroHeadline,
    hero_subtitle: heroDescription,
    hero_public_url: heroImageUrl,
    hero_kind: heroImageUrl ? 'image' : null,
    thumbnail_url: heroThumbnailUrl,
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
  const heroImageUrl = uploadedHero?.publicUrl ?? placeSnapshot?.photos[0]?.photoUri ?? null
  const locationHeroImageUrl = uploadedHero?.publicUrl ?? placeSnapshot?.photos[1]?.photoUri ?? null
  const heroThumbnailUrl = uploadedHero?.thumbnailUrl ?? heroImageUrl
  const locationSlug = slugify(brandName) || 'main'
  const locationId = 'draft-location-main'

  const description = null
  const menu: DraftMenuRecord | null = null

  const reviews = (placeSnapshot?.reviews ?? [])
    .filter(review => typeof review.rating === 'number' && review.rating > 0)
    .map((review, index) => ({
      id: review.reviewId ? `draft-review-${review.reviewId.replace(/\//g, '-')}` : `draft-review-${index + 1}`,
      author_name: review.authorName,
      reviewer_photo_url: review.authorPhotoUrl,
      rating: review.rating ?? 0,
      title: null,
      content: review.text,
      owner_reply: null,
      owner_reply_at: null,
      photo_urls: null,
      source: 'google_places',
      created_at: review.publishedAt,
    }))

  const qa: DraftQaRecord[] = []
  const posts: DraftPostRecord[] = []

  const brandColor = input.brandDraft?.brandColor?.trim() || null
  const heroHeadline = input.brandDraft?.heroHeadline?.trim() || null
  const heroDescription = input.brandDraft?.heroDescription?.trim() || null
  const content = buildDraftContent(brandName, input.vertical, heroImageUrl, heroThumbnailUrl, heroHeadline, heroDescription)

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
        hero_image_url: heroImageUrl,
        location_hero_image_url: locationHeroImageUrl,
        logo_url: uploadedLogo?.publicUrl ?? null,
        brand_color: brandColor,
        draft_logo_note: input.brandDraft?.logoNote?.trim() || null,
        draft_hero_photo_note: input.brandDraft?.heroPhotoNote?.trim() || null,
        draft_hero_headline: heroHeadline,
        draft_hero_description: heroDescription,
        draft_logo_asset_id: uploadedLogo?.draftAssetId ?? null,
        draft_hero_asset_id: uploadedHero?.draftAssetId ?? null,
      },
      draftMedia: {
        logo: uploadedLogo,
        hero: uploadedHero,
      },
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
        hero_url: locationHeroImageUrl,
        thumbnail_url: locationHeroImageUrl,
      }],
      menu,
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
  if (!parsed || parsed.version !== 1 || !parsed.preview || !parsed.preview.draftMedia) {
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
