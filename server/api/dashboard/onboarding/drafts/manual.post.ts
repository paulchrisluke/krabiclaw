import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
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

  const previewSecret = env.PREVIEW_SECRET as string | undefined
  if (!previewSecret) return jsonResponse({ error: 'Preview secret not configured' }, { status: 503 })

  const body = await readBody(event) as {
    name?: unknown
    vertical?: unknown
    details?: Record<string, unknown> | null
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return jsonResponse({ error: 'name is required' }, { status: 400 })

  if (typeof body?.vertical !== 'string' || !VALID_VERTICALS.includes(body.vertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`,
    }, { status: 400 })
  }
  const vertical = body.vertical as SiteVertical

  const details = body.details && typeof body.details === 'object' ? body.details : null
  const detailName = typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : name

  let dashboard: Awaited<ReturnType<typeof getDashboardContext>> | null = null
  try {
    dashboard = await getDashboardContext(event, { requireSite: false })
  } catch {
    dashboard = null
  }
  const payload = buildOnboardingDraftPayload({
    name,
    vertical,
    place: null,
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
    sourceType: 'manual',
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
