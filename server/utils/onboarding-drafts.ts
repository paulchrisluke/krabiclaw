import type { SiteVertical } from '~/utils/vertical-copy'
import { execute, queryFirst } from '~/server/db'
import type { PlaceDetails } from '~/server/utils/google-places'

type DraftSourceType = 'google_places' | 'manual'

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
  hero_video_public_url: string | null
  hero_video_kind: string | null
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

const DRAFT_MENU_SECTIONS: Partial<Record<SiteVertical, Array<[string, string, string, string, number]>>> = {
  restaurant: [
    ['Starter', 'Sample Starter', 'starter', 'A delicious way to begin. Update this with your actual starter.', 8],
    ['Starter', 'Soup of the Day', 'soup', 'Ask your server. Made fresh daily.', 7],
    ['Mains', 'House Special', 'house-special', 'Your signature dish goes here. Update with name, description, and price.', 18],
    ['Mains', 'Chef\'s Recommendation', 'chefs-rec', 'The dish your team is most proud of.', 20],
    ['Mains', 'Vegetarian Option', 'vegetarian', 'A plant-based option for every menu.', 15],
    ['Desserts', 'Dessert of the Day', 'dessert', 'Ask your server what is on today.', 7],
    ['Drinks', 'House Lemonade', 'lemonade', 'Made fresh each morning.', 4],
    ['Drinks', 'Soft Drink', 'soft-drink', 'Pepsi, Diet Pepsi, or lemonade.', 3],
  ],
}

const DRAFT_QA: Partial<Record<SiteVertical, Array<[string, string, number]>>> = {
  restaurant: [
    ['Do you take reservations?', 'Yes — you can book a table through our reservations page or call us directly.', 1],
    ['Do you have vegetarian or vegan options?', 'Yes, we have vegetarian options on the menu. Ask your server about vegan modifications.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
  experience: [
    ['How do I book a class?', 'You can book a class or session directly from our experiences page.', 1],
    ['What should I bring?', 'Comfortable clothes and an open mind. We provide all the materials and tools needed.', 2],
    ['Is there parking nearby?', 'Yes — there is parking available nearby. See our contact page for directions.', 3],
  ],
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

function nowIso() {
  return new Date().toISOString()
}

function draftUid(prefix: string) {
  return `draft-${prefix}-${crypto.randomUUID()}`
}

function asPlaceSnapshot(place: PlaceDetails): PlaceDetailsSnapshot {
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

function buildDraftContent(brandName: string, vertical: SiteVertical, heroImageUrl: string | null, heroThumbnailUrl: string | null): DraftContentRecord[] {
  const updatedAt = nowIso()
  const baseHeroSubtitle = vertical === 'experience'
    ? `${brandName} is built around hands-on learning, skilled instruction, and a space that invites you to try something new.`
    : `${brandName} is built around generous food, warm service, and a room that feels easy to return to.`

  const ctaTitle = vertical === 'experience' ? 'Book a class.' : 'Come hungry.'
  const aboutCta = vertical === 'experience' ? 'Book a class' : 'Come dine with us'
  const storyBody = vertical === 'experience'
    ? `${brandName} started with a simple idea: share a skill, build a community, and make the process enjoyable from start to finish.\n\nToday, that same idea shapes every class, workshop, and session we offer.`
    : `${brandName} started with a simple idea: make the food we love, serve it with care, and keep the welcome honest.\n\nToday, that same idea guides every part of the restaurant, from the first prep list of the morning to the last table of the night.`
  const journeyBody = vertical === 'experience'
    ? `${brandName} is a hands-on studio focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your studio: where you started, what changed along the way, and what guests can expect when they arrive.`
    : `${brandName} is a neighbourhood restaurant focused on doing a small number of things exceptionally well.\n\nAdd the milestones that shaped your restaurant: where you started, what changed along the way, and what guests can expect when they walk through the door.`

  return [
    {
      page: 'home',
      field: 'hero',
      content: null,
      value: null,
      type: 'text',
      hero_title: brandName,
      hero_subtitle: baseHeroSubtitle,
      hero_public_url: heroImageUrl,
      hero_kind: heroImageUrl ? 'image' : null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: heroThumbnailUrl,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'home',
      field: 'cta.title',
      content: ctaTitle,
      value: ctaTitle,
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'hero',
      content: null,
      value: null,
      type: 'text',
      hero_title: 'About Us',
      hero_subtitle: baseHeroSubtitle,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      // No stock photo: SayaBrandStory already renders a clean single-column
      // layout with no image rather than a broken/empty image block.
      page: 'about',
      field: 'story.image',
      content: null,
      value: null,
      type: 'media',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'story.headline',
      content: 'Our Story',
      value: 'Our Story',
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'story.body',
      content: storyBody,
      value: storyBody,
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'journey.title',
      content: 'Our Journey',
      value: 'Our Journey',
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'journey.body',
      content: journeyBody,
      value: journeyBody,
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
    {
      page: 'about',
      field: 'cta.title',
      content: aboutCta,
      value: aboutCta,
      type: 'text',
      hero_title: null,
      hero_subtitle: null,
      hero_public_url: null,
      hero_kind: null,
      hero_video_public_url: null,
      hero_video_kind: null,
      thumbnail_url: null,
      component: null,
      updated_at: updatedAt,
    },
  ]
}

export function buildOnboardingDraftPayload(input: {
  name: string
  vertical: SiteVertical
  details: DraftDetailsInput
  place: PlaceDetails | null
}): OnboardingDraftPayload {
  const brandName = input.details.name || input.name
  const subdomainCandidate = slugify(brandName).slice(0, 40)
  const placeSnapshot = input.place ? asPlaceSnapshot(input.place) : null
  // No stock photo fallback here: a generic stock image isn't actually theirs, and the
  // Saya hero renders a brand-color + icon treatment when no real photo is available yet.
  const heroImageUrl = placeSnapshot?.photos[0]?.photoUri ?? null
  const locationHeroImageUrl = placeSnapshot?.photos[1]?.photoUri ?? heroImageUrl
  const heroThumbnailUrl = heroImageUrl
  const locationSlug = slugify(brandName) || 'main'
  const locationId = 'draft-location-main'

  const description = input.vertical === 'experience'
    ? `${brandName} is a hands-on studio focused on creating memorable experiences and helping guests learn something new.`
    : `${brandName} is a welcoming place focused on great food, warm service, and the details guests remember.`

  const menuTemplate = DRAFT_MENU_SECTIONS[input.vertical]
  const menu: DraftMenuRecord | null = menuTemplate
    ? {
        id: draftUid('menu'),
        name: 'Menu',
        status: 'published',
        items: menuTemplate.map(([section, itemName, itemSlug, itemDescription, price], index) => ({
          id: draftUid('menu-item'),
          section,
          name: itemName,
          slug: itemSlug,
          description: itemDescription,
          price_amount: price,
          available: true,
          sort_order: index,
        })),
      }
    : null

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

  const qa = (DRAFT_QA[input.vertical] ?? DRAFT_QA.restaurant ?? []).map(([question, answer, sortOrder]) => ({
    id: draftUid('qa'),
    question,
    answer,
    answer_author: brandName,
    sort_order: sortOrder,
  }))

  const posts: DraftPostRecord[] = [{
    id: draftUid('post'),
    title: 'Welcome to our new website',
    body: input.vertical === 'experience'
      ? 'We just launched our new site — you can now browse what we offer, check our hours, and get in touch. More updates coming soon.'
      : 'We just launched our new site — you can now browse our full menu, check our hours, and book a table online. More updates coming soon.',
    status: 'published',
    published_at: nowIso(),
  }]

  const content = buildDraftContent(brandName, input.vertical, heroImageUrl, heroThumbnailUrl)

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
  if (!parsed || parsed.version !== 1) {
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

  // Concurrency-safe upsert: try INSERT first, retry as UPDATE on UNIQUE constraint violation
  const id = crypto.randomUUID()
  try {
    await execute(db, `
      INSERT INTO onboarding_drafts
        (id, user_id, organization_id, name, vertical, subdomain_candidate, source_type, status, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
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
    return {
      id,
      subdomainCandidate,
      payload: input.payload,
    }
  } catch (err: unknown) {
    // UNIQUE constraint violation on (user_id, status = 'active') means another request inserted first
    // Retry as UPDATE on the existing active draft
    const existing = await queryFirst<{ id: string }>(db, `
      SELECT id FROM onboarding_drafts
      WHERE user_id = ? AND status = 'active'
      LIMIT 1
    `, [input.userId])

    if (!existing) {
      throw err // Re-throw if it's not a conflict we can handle
    }

    const updateResult = await execute(db, `
      UPDATE onboarding_drafts
      SET organization_id = ?, name = ?, vertical = ?, subdomain_candidate = ?, source_type = ?, payload_json = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
    `, [
      input.organizationId ?? null,
      input.name,
      input.vertical,
      subdomainCandidate,
      input.sourceType,
      payloadJson,
      now,
      existing.id,
    ])

    // If no row was updated, the draft is no longer active - rethrow
    if (updateResult.meta.changes === 0) {
      throw err
    }

    return {
      id: existing.id,
      subdomainCandidate,
      payload: input.payload,
    }
  }
}
