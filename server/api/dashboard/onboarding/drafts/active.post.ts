import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getPlaceDetails, PlaceDetailsError } from '~/server/utils/google-places'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { queryFirst } from '~/server/db'
import {
  buildOnboardingDraftPayload, getDraftMedia, parseOnboardingDraftPayload, upsertActiveOnboardingDraft, type DraftBrandInput, type DraftDetailsInput, type DraftUploadedImage, type OnboardingDraftPayload, type PlaceDetailsSnapshot, } from '~/server/utils/onboarding-drafts'
import { createScopedPreviewToken } from '~/server/utils/preview-token'
import { VALID_VERTICALS } from '~/server/utils/site-creation'
import { DEFAULT_CURRENCY, isCurrencyCode } from '~/shared/currencies'
import type { SiteVertical } from '~/utils/vertical-copy'

type DraftSourceType = 'manual' | 'google_places'

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseCurrency(value: unknown, fallback = DEFAULT_CURRENCY) {
  if (typeof value !== 'string') return fallback
  const currency = value.toUpperCase()
  return isCurrencyCode(currency) ? currency : fallback
}

function detailsFromBody(
  raw: Record<string, unknown> | null, existing: DraftDetailsInput | null, name: string, ): DraftDetailsInput {
  return {
    name, city: stringOrNull(raw?.city) ?? existing?.city ?? null, address: stringOrNull(raw?.address) ?? existing?.address ?? null, phone: stringOrNull(raw?.phone) ?? existing?.phone ?? null, websiteUrl: stringOrNull(raw?.websiteUrl) ?? existing?.websiteUrl ?? null, openingHours: stringOrNull(raw?.openingHours) ?? existing?.openingHours ?? null, notificationPhone: stringOrNull(raw?.notificationPhone) ?? existing?.notificationPhone ?? null, timezone: stringOrNull(raw?.timezone) ?? existing?.timezone ?? null, currency: parseCurrency(raw?.currency, existing?.currency ?? DEFAULT_CURRENCY), isPrimary: typeof raw?.isPrimary === 'boolean' ? raw.isPrimary : existing?.isPrimary ?? true, }
}

function imageFromBody(raw: unknown, existing: DraftUploadedImage | null): DraftUploadedImage | null {
  if (!raw || typeof raw !== 'object') return existing
  const record = raw as Record<string, unknown>
  const draftAssetId = stringOrNull(record.draftAssetId)
  const cloudflareImageId = stringOrNull(record.cloudflareImageId)
  const publicUrl = stringOrNull(record.publicUrl)
  if (!draftAssetId || !cloudflareImageId || !publicUrl) return existing
  return {
    draftAssetId, cloudflareImageId, publicUrl, thumbnailUrl: stringOrNull(record.thumbnailUrl), mimeType: stringOrNull(record.mimeType), fileName: stringOrNull(record.fileName), fileSize: typeof record.fileSize === 'number' && Number.isFinite(record.fileSize) ? record.fileSize : null, }
}

function brandFromBody(raw: Record<string, unknown> | null, existing: OnboardingDraftPayload | null): DraftBrandInput {
  const existingConfig = existing?.preview.config ?? {}
  const existingHomeHero = existing?.preview.content.find(item => item.page === 'home' && item.field === 'hero') ?? null
  const existingLogo = existing ? getDraftMedia(existing, 'logo') : null
  const existingHero = existing ? getDraftMedia(existing, 'hero') : null
  const existingHeroHeadline = existingHomeHero?.hero_title && existing && existingHeroHeadlineIsCustom(existingHomeHero.hero_title, existing.preview.brandName)
    ? existingHomeHero.hero_title
    : null

  return {
    brandColor: stringOrNull(raw?.brandColor) ?? stringOrNull(existingConfig.brand_color) ?? null, logoNote: stringOrNull(raw?.logoNote) ?? stringOrNull(existingConfig.draft_logo_note) ?? null, logoPreviewUrl: stringOrNull(raw?.logoPreviewUrl) ?? existingLogo?.publicUrl ?? null, heroPhotoNote: stringOrNull(raw?.heroPhotoNote) ?? stringOrNull(existingConfig.draft_hero_photo_note) ?? null, heroPreviewUrl: stringOrNull(raw?.heroPreviewUrl) ?? existingHero?.publicUrl ?? null, heroHeadline: stringOrNull(raw?.heroHeadline) ?? stringOrNull(existingConfig.draft_hero_headline) ?? existingHeroHeadline, heroDescription: stringOrNull(raw?.heroDescription) ?? stringOrNull(existingConfig.draft_hero_description) ?? null, logoImage: imageFromBody(raw?.logoImage, existingLogo), heroImage: imageFromBody(raw?.heroImage, existingHero), }
}

function existingHeroHeadlineIsCustom(headline: string, brandName: string) {
  return headline.trim().length > 0 && headline.trim() !== brandName.trim()
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const previewSecret = env.PREVIEW_SECRET as string | undefined
  if (!previewSecret) return jsonResponse({ error: 'Preview secret not configured' }, { status: 503 })

  const body = await readBody(event) as {
    sourceType?: unknown
    vertical?: unknown
    placeId?: unknown
    name?: unknown
    details?: Record<string, unknown> | null
    brandDraft?: Record<string, unknown> | null
  }

  const sourceType = body?.sourceType === 'google_places' ? 'google_places' : body?.sourceType === 'manual' ? 'manual' : null
  if (!sourceType) return jsonResponse({ error: 'sourceType must be manual or google_places' }, { status: 400 })

  const existingRow = await queryFirst<{ id: string; payload_json: string; source_type: DraftSourceType }>(db, `
    SELECT id, payload_json, source_type
    FROM onboarding_drafts
    WHERE user_id = ? AND status = 'active'
    LIMIT 1
  `, [session.user.id])

  const existingPayload = existingRow ? parseOnboardingDraftPayload(existingRow.payload_json) : null

  const rawVertical = typeof body?.vertical === 'string' ? body.vertical : existingPayload?.preview.vertical
  if (!rawVertical || !VALID_VERTICALS.includes(rawVertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`, }, { status: 400 })
  }
  const vertical = rawVertical as SiteVertical

  let place: Awaited<ReturnType<typeof getPlaceDetails>> | PlaceDetailsSnapshot | null = null
  let fetchedPlaceDetails = false
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
  if (sourceType === 'google_places') {
    const existingPlace = existingPayload?.source.place ?? null
    if (placeId) {
      if (existingPlace?.placeId === placeId) {
        place = existingPlace
      } else {
        const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
        if (!apiKey) return jsonResponse({ error: 'Google Places API key not configured' }, { status: 503 })
        try {
          place = await getPlaceDetails(apiKey, placeId)
          fetchedPlaceDetails = true
        } catch (error) {
          const status = error instanceof PlaceDetailsError ? error.statusCode : 502
          return jsonResponse({
            error: error instanceof Error ? error.message : 'Could not fetch place details. Try again.', }, { status })
        }
      }
    } else if (existingPlace) {
      place = existingPlace
    } else {
      return jsonResponse({ error: 'placeId is required for Google Places drafts' }, { status: 400 })
    }
  }

  let dashboard: Awaited<ReturnType<typeof getDashboardContext>> | null
  try {
    dashboard = await getDashboardContext(event, { requireSite: false })
  } catch {
    dashboard = null
  }
  if (sourceType === 'google_places' && fetchedPlaceDetails && dashboard?.organization?.id) {
    await chargeFlatCredits(db, dashboard.organization.id, { action: 'google_places_details' })
  }

  const rawDetails = body.details && typeof body.details === 'object' ? body.details : null
  const bodyName = stringOrNull(rawDetails?.name) ?? stringOrNull(body.name)
  const name = bodyName
    ?? place?.name
    ?? existingPayload?.source.details.name
    ?? existingPayload?.preview.brandName
    ?? ''
  if (!name) return jsonResponse({ error: 'name is required' }, { status: 400 })

  const details = detailsFromBody(rawDetails, existingPayload?.source.details ?? null, name)
  const brandDraft = brandFromBody(body.brandDraft && typeof body.brandDraft === 'object' ? body.brandDraft : null, existingPayload)
  const payload = buildOnboardingDraftPayload({
    name, vertical, place, details, brandDraft, })

  const draft = await upsertActiveOnboardingDraft(db, {
    userId: session.user.id, organizationId: dashboard?.organization?.id ?? null, name: payload.preview.brandName, vertical, sourceType, payload, })

  const expiresAt = Date.now() + (1000 * 60 * 60 * 12)
  const previewToken = await createScopedPreviewToken(previewSecret, 'draft', draft.id, expiresAt)

  return jsonResponse({
    success: true, draftId: draft.id, draftName: payload.preview.brandName, subdomainCandidate: draft.subdomainCandidate, previewToken, })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
