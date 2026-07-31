import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { verifyScopedPreviewToken } from '~/server/utils/preview-token'

export async function loadPublicDraftBootstrap(
  event: H3Event,
  draftIdInput: string,
  query: Record<string, string | undefined>,
  options: { signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted()
  const draftId = String(draftIdInput || '').trim()
  if (!draftId) throw createError({ statusCode: 400, statusMessage: 'draftId required' })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const rawToken = typeof query.token === 'string' ? query.token : null
  if (!rawToken || !env.PREVIEW_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Preview token required' })
  }

  const isPreviewAuthorized = await verifyScopedPreviewToken(String(env.PREVIEW_SECRET), 'draft', draftId, rawToken)
  options.signal?.throwIfAborted()
  if (!isPreviewAuthorized) throw createError({ statusCode: 403, statusMessage: 'Preview token invalid' })

  const page = typeof query.page === 'string' ? query.page : 'home'
  const supportedPages = new Set([
    'home', 'locations', 'location', 'about', 'contact', 'reservations',
    'order', 'qa', 'reviews', 'posts', 'experiences', 'photos', 'menu', 'blog',
  ])
  if (!supportedPages.has(page)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported draft preview page' })
  }
  const locationSlug = typeof query.location === 'string' ? query.location : null
  const experienceSlug = typeof query.experience === 'string' ? query.experience : null
  const includeMenu = query.menu === '1' || query.menu === 'true'
  const contract = query.contract === 'shell' ? 'shell' : 'page'
  const routeDataType = page === 'reviews' || page === 'posts' || page === 'photos' || page === 'qa'
    ? page
    : null
  const dataType = typeof query.data === 'string' ? query.data : routeDataType
  const supportedDataTypes = new Set(['reviews', 'photos', 'qa', 'posts', 'blog', 'blogPost'])
  if (dataType && !supportedDataTypes.has(dataType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported draft preview dataset' })
  }
  if (contract === 'page' && (page === 'experiences' || experienceSlug)) {
    throw createError({ statusCode: 422, statusMessage: 'Draft preview does not contain experience records' })
  }
  if (contract === 'page' && (page === 'blog' || dataType === 'blog' || dataType === 'blogPost')) {
    throw createError({ statusCode: 422, statusMessage: 'Draft preview does not contain blog records' })
  }

  const row = await queryFirst<{ payload_json: string }>(db, `
    SELECT payload_json
    FROM onboarding_drafts
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [draftId])
  options.signal?.throwIfAborted()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })

  const payload = parseOnboardingDraftPayload(row.payload_json)
  const primaryLocation = payload.preview.locations[0] ?? null
  const resolvedLocation = locationSlug
    ? payload.preview.locations.find(location => location.slug === locationSlug) ?? null
    : primaryLocation
  if (locationSlug && !resolvedLocation) {
    throw createError({ statusCode: 404, statusMessage: 'Draft location not found' })
  }

  const content = payload.preview.content.filter((item) => item.page === page)
  const reviewsList = dataType === 'reviews' ? payload.preview.reviews : []
  const photosList = dataType === 'photos'
    ? payload.preview.locations
        .flatMap(location => [location.hero_url, location.thumbnail_url])
        .filter((url): url is string => Boolean(url))
        .map((url, index) => ({ id: `draft-photo-${index + 1}`, url, category: 'OTHER' }))
    : []
  const qaList = dataType === 'qa' ? payload.preview.qa : []
  const postsList = dataType === 'posts' ? payload.preview.posts : []

  const ratings = payload.preview.reviews.map(review => review.rating).filter((value) => Number.isFinite(value))
  const reviewsAggregate = ratings.length
    ? {
        average_rating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
        review_count: ratings.length,
      }
    : null

  const config = {
    ...payload.preview.config,
    brand_name: payload.preview.brandName,
    logo_url: payload.preview.config.logo_url || payload.preview.draftMedia.logo?.publicUrl || null,
    og_image_url: payload.preview.config.hero_image_url || payload.preview.draftMedia.hero?.publicUrl || null,
  }

  if (contract === 'shell') {
    return {
      site: {
        brand_name: payload.preview.brandName,
        logo_url: config.logo_url,
        favicon_url: null,
        vertical: payload.preview.vertical,
      },
      locations: payload.preview.locations,
      config,
      googleBusiness: {
        business: null,
        reviews: [],
        media: [],
        posts: [],
        syncedAt: null,
      },
      locales: payload.preview.locales,
      hasExperiences: payload.preview.hasExperiences,
      hasMenu: Boolean(payload.preview.menu?.items.length),
    }
  }

  return {
    kind: page,
    site: {
      brand_name: payload.preview.brandName,
      logo_url: config.logo_url,
      favicon_url: null,
      vertical: payload.preview.vertical,
    },
    locations: payload.preview.locations,
    content,
    menu: includeMenu ? payload.preview.menu : null,
    locationReviews: payload.preview.reviews.slice(0, 3),
    globalReviews: page === 'home' || page === 'reviews' ? payload.preview.reviews : [],
    reviewsAggregate,
    reviewsList,
    photosList,
    qaList,
    postsList,
    globalPosts: page === 'home' || page === 'posts' ? payload.preview.posts : [],
    blogList: [],
    blogPost: null,
    reservationPolicySiteDefault: null,
    reservationPolicyByLocation: {},
    experiencePolicySiteDefault: null,
    experiencePolicyById: {},
    experiencesList: [],
    experienceDetail: null,
    location: resolvedLocation,
  }
}
