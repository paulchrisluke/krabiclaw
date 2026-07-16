import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetails, PlaceDetailsError } from '~/server/utils/google-places'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { buildOnboardingDraftPayload, upsertActiveOnboardingDraft } from '~/server/utils/onboarding-drafts'
import { createScopedPreviewToken } from '~/server/utils/preview-token'
import { VALID_VERTICALS } from '~/server/utils/site-creation'
import type { SiteVertical } from '~/utils/vertical-copy'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })

  const previewSecret = env.PREVIEW_SECRET as string | undefined
  if (!previewSecret) return jsonResponse({ error: 'Preview secret not configured' }, { status: 503 })

  const body = await readBody(event) as {
    placeId?: unknown
    vertical?: unknown
    details?: Record<string, unknown> | null
  }

  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  if (!placeId) return jsonResponse({ error: 'placeId is required' }, { status: 400 })

  if (typeof body?.vertical !== 'string' || !VALID_VERTICALS.includes(body.vertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`,
    }, { status: 400 })
  }
  const vertical = body.vertical as SiteVertical

  const details = body.details && typeof body.details === 'object' ? body.details : null
  const detailName = typeof details?.name === 'string' ? details.name.trim() : ''
  if (!detailName) return jsonResponse({ error: 'Business name is required' }, { status: 400 })

  let place
  try {
    place = await getPlaceDetails(apiKey, placeId)
  } catch (error) {
    const status = error instanceof PlaceDetailsError ? error.statusCode : 502
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Could not fetch place details. Try again.',
    }, { status })
  }

  let dashboard: Awaited<ReturnType<typeof getDashboardContext>> | null = null
  try {
    dashboard = await getDashboardContext(event, { requireSite: false })
  } catch {
    dashboard = null
  }
  // Only an already-existing org can be charged — a brand new user has none
  // yet at this draft stage, and this is a one-time onboarding lookup anyway.
  if (dashboard?.organization?.id) {
    await chargeFlatCredits(db, dashboard.organization.id, { action: 'google_places_details' }).catch(() => {})
  }
  const payload = buildOnboardingDraftPayload({
    name: place.name,
    vertical,
    place,
    details: {
      name: detailName,
      city: typeof details?.city === 'string' && details.city.trim() ? details.city.trim() : null,
      address: typeof details?.address === 'string' && details.address.trim() ? details.address.trim() : null,
      phone: typeof details?.phone === 'string' && details.phone.trim() ? details.phone.trim() : null,
      websiteUrl: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim() ? details.websiteUrl.trim() : null,
      openingHours: typeof details?.openingHours === 'string' && details.openingHours.trim() ? details.openingHours.trim() : null,
      notificationPhone: typeof details?.notificationPhone === 'string' && details.notificationPhone.trim() ? details.notificationPhone.trim() : null,
      timezone: typeof details?.timezone === 'string' && details.timezone.trim() ? details.timezone.trim() : null,
      isPrimary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : true,
    },
  })

  const draft = await upsertActiveOnboardingDraft(db, {
    userId: session.user.id,
    organizationId: dashboard?.organization?.id ?? null,
    name: payload.preview.brandName,
    vertical,
    sourceType: 'google_places',
    payload,
  })

  const expiresAt = Date.now() + (1000 * 60 * 60 * 12)
  const previewToken = await createScopedPreviewToken(previewSecret, 'draft', draft.id, expiresAt)

  return jsonResponse({
    success: true,
    draftId: draft.id,
    draftName: payload.preview.brandName,
    subdomainCandidate: draft.subdomainCandidate,
    previewToken,
  })
})
