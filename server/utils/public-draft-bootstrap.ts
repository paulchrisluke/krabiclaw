import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { verifyScopedPreviewToken } from '~/server/utils/preview-token'

async function loadDraftPreviewSource(
  event: H3Event,
  draftIdInput: string,
  token: string | undefined,
  options: { signal?: AbortSignal } = {},
) {
  options.signal?.throwIfAborted()
  const draftId = String(draftIdInput || '').trim()
  if (!draftId) throw createError({ statusCode: 400, statusMessage: 'draftId required' })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const rawToken = typeof token === 'string' ? token : null
  if (!rawToken || !env.PREVIEW_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Preview token required' })
  }

  const isPreviewAuthorized = await verifyScopedPreviewToken(String(env.PREVIEW_SECRET), 'draft', draftId, rawToken)
  options.signal?.throwIfAborted()
  if (!isPreviewAuthorized) throw createError({ statusCode: 403, statusMessage: 'Preview token invalid' })

  const row = await queryFirst<{ payload_json: string }>(db, `
    SELECT payload_json
    FROM onboarding_drafts
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [draftId])
  options.signal?.throwIfAborted()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
  return parseOnboardingDraftPayload(row.payload_json)
}

function buildDraftShellPayload(payload: Awaited<ReturnType<typeof loadDraftPreviewSource>>) {
  const config = {
    ...payload.preview.config,
    brand_name: payload.preview.brandName,
    logo_url: payload.preview.config.logo_url || payload.preview.draftMedia.logo?.publicUrl || null,
    og_image_url: payload.preview.config.hero_image_url || payload.preview.draftMedia.hero?.publicUrl || null,
  }
  const draftPhone = typeof payload.preview.config.phone === 'string'
    ? payload.preview.config.phone
    : null

  return {
    site: {
      brand_name: payload.preview.brandName,
      brand_description: null,
      logo_url: config.logo_url,
      logo_mime_type: null,
      favicon_url: null,
      vertical: payload.preview.vertical,
      config: { phone: draftPhone },
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

export async function loadPublicDraftPage(
  event: H3Event,
  draftId: string,
  query: Record<string, string | undefined>,
  options: { signal?: AbortSignal } = {},
) {
  const payload = await loadDraftPreviewSource(event, draftId, query.token, options)
  options.signal?.throwIfAborted()
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
  const requestedDatasets = new Set(
    typeof query.datasets === 'string' && query.datasets
      ? query.datasets.split(',')
      : [],
  )
  const includeMenu = requestedDatasets.has('menu')
  const supportedDatasets = new Set([
    'content', 'location', 'menu', 'reviews', 'photos', 'qa', 'posts',
    'blog', 'blogPost', 'experiences', 'experienceDetail',
    'reservationPolicies', 'experiencePolicies',
  ])
  if ([...requestedDatasets].some(dataset => !supportedDatasets.has(dataset))) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported draft preview dataset' })
  }
  if (page === 'experiences' || experienceSlug) {
    throw createError({ statusCode: 422, statusMessage: 'Draft preview does not contain experience records' })
  }
  if (page === 'blog' || requestedDatasets.has('blog') || requestedDatasets.has('blogPost')) {
    throw createError({ statusCode: 422, statusMessage: 'Draft preview does not contain blog records' })
  }

  const primaryLocation = payload.preview.locations[0] ?? null
  const resolvedLocation = locationSlug
    ? payload.preview.locations.find(location => location.slug === locationSlug) ?? null
    : primaryLocation
  if (locationSlug && !resolvedLocation) {
    throw createError({ statusCode: 404, statusMessage: 'Draft location not found' })
  }

  const shell = buildDraftShellPayload(payload)

  const content = payload.preview.content.filter((item) => item.page === page)
  const reviewsList = requestedDatasets.has('reviews') ? payload.preview.reviews : []
  const photosList = requestedDatasets.has('photos')
    ? payload.preview.locations
        .flatMap(location => [location.hero_url, location.thumbnail_url])
        .filter((url): url is string => Boolean(url))
        .map((url, index) => ({ id: `draft-photo-${index + 1}`, url, category: 'OTHER' }))
    : []
  const qaList = requestedDatasets.has('qa') ? payload.preview.qa : []
  const postsList = requestedDatasets.has('posts') ? payload.preview.posts : []

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
  return {
    kind: page,
    shell,
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
    reservationPolicyByLocation: Object.fromEntries(
      payload.preview.locations.map(location => [String(location.id), null]),
    ),
    experiencePolicySiteDefault: null,
    experiencePolicyById: {},
    experiencesList: [],
    experienceDetail: null,
    location: resolvedLocation,
  }
}

export async function loadPublicDraftShell(
  event: H3Event,
  draftId: string,
  query: { token?: string },
  options: { signal?: AbortSignal } = {},
) {
  const payload = await loadDraftPreviewSource(event, draftId, query.token, options)
  return buildDraftShellPayload(payload)
}
