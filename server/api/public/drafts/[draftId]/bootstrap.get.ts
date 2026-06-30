import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { verifyScopedPreviewToken } from '~/server/utils/preview-token'

export default defineEventHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  if (!draftId) return jsonResponse({ error: 'draftId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const query = getQuery(event)
  const rawToken = typeof query.token === 'string' ? query.token : null
  if (!rawToken || !env.PREVIEW_SECRET) {
    return jsonResponse({ error: 'Preview token required' }, { status: 401 })
  }

  const isPreviewAuthorized = await verifyScopedPreviewToken(String(env.PREVIEW_SECRET), 'draft', draftId, rawToken)
  if (!isPreviewAuthorized) return jsonResponse({ error: 'Preview token invalid' }, { status: 403 })

  const page = typeof query.page === 'string' ? query.page : 'home'
  const locationSlug = typeof query.location === 'string' ? query.location : null
  const includeMenu = query.menu === '1' || query.menu === 'true'
  const dataType = typeof query.data === 'string' ? query.data : null

  const row = await queryFirst<{ payload_json: string }>(db, `
    SELECT payload_json
    FROM onboarding_drafts
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [draftId])

  if (!row) return jsonResponse({ error: 'Draft not found' }, { status: 404 })

  const payload = parseOnboardingDraftPayload(row.payload_json)
  const primaryLocation = payload.preview.locations[0] ?? null
  const resolvedLocation = locationSlug
    ? payload.preview.locations.find(location => location.slug === locationSlug) ?? primaryLocation
    : primaryLocation

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

  return jsonResponse({
    locations: payload.preview.locations,
    config: payload.preview.config,
    googleBusiness: {
      business: null,
      reviews: [],
      media: [],
      posts: [],
      syncedAt: null,
    },
    content,
    menu: includeMenu ? payload.preview.menu : null,
    locationReviews: payload.preview.reviews.slice(0, 3),
    reviewsAggregate,
    reviewsList,
    photosList,
    qaList,
    postsList,
    locales: payload.preview.locales,
    hasExperiences: payload.preview.hasExperiences,
    experiencesList: [],
    experienceDetail: null,
    location: resolvedLocation,
  })
})
