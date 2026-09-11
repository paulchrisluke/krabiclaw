import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPlaceDetails, PlaceDetailsError } from '~/server/utils/google-places'
import { queryFirst } from '~/server/db'
import {
  buildOnboardingDraftPayload, getDraftMedia, type DraftProductInput, parseOnboardingDraftPayload, upsertActiveOnboardingDraft, type DraftBrandInput, type DraftDetailsInput, type DraftUploadedImage, type OnboardingDraftPayload, type PlaceDetailsSnapshot, } from '~/server/utils/onboarding-drafts'
import { createPreviewToken, PREVIEW_TOKEN_TTL_MS, previewSecretOf } from '~/server/utils/preview-token'
import { VALID_VERTICALS } from '~/server/utils/site-creation'
import { applyOnboardingDraftToSite, ensureOnboardingSite } from '~/server/utils/onboarding-site'
import { isValidTimezone } from '~/utils/timezone'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { getPhoneCountry } from '~/utils/phone'
import type { SiteVertical } from '~/utils/vertical-copy'

type DraftSourceType = 'manual' | 'google_places'

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// An absent or unrecognised currency stays unknown. Defaulting it to USD here
// would persist a currency the owner never chose as if they had.
function parseCurrency(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string') return null
  const currency = value.toUpperCase()
  return isCurrencyCode(currency) ? currency : null
}

// The same list the wizard's country picker is built from, so the endpoint
// accepts exactly what the UI can produce. A two-letter shape check would take
// "AA" and "UK", neither of which is an assigned ISO 3166-1 alpha-2 code.
function parseCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const country = value.trim().toUpperCase()
  return getPhoneCountry(country) ? country : null
}

function detailsFromBody(
  raw: Record<string, unknown> | null, existing: DraftDetailsInput | null, name: string, place: PlaceDetailsSnapshot | Awaited<ReturnType<typeof getPlaceDetails>> | null, ): DraftDetailsInput {
  return {
    name, country: raw?.country === undefined ? existing?.country ?? null : parseCountry(raw.country), city: stringOrNull(raw?.city) ?? existing?.city ?? null, streetAddress: stringOrNull(raw?.streetAddress) ?? existing?.streetAddress ?? null, addressLine2: stringOrNull(raw?.addressLine2) ?? existing?.addressLine2 ?? null, region: stringOrNull(raw?.region) ?? existing?.region ?? null, postalCode: stringOrNull(raw?.postalCode) ?? existing?.postalCode ?? null, phone: stringOrNull(raw?.phone) ?? existing?.phone ?? null, websiteUrl: stringOrNull(raw?.websiteUrl) ?? existing?.websiteUrl ?? null, openingHours: parseOpeningHours(raw?.openingHours === undefined ? (existing ? existing.openingHours : place?.openingHours ?? null) : raw.openingHours), specialHours: parseSpecialHours(raw?.specialHours === undefined ? existing?.specialHours ?? null : raw.specialHours), notificationPhone: stringOrNull(raw?.notificationPhone) ?? existing?.notificationPhone ?? null, timezone: stringOrNull(raw?.timezone) ?? (existing ? existing.timezone : place?.timezone ?? null), currency: raw?.currency === undefined ? existing?.currency ?? null : parseCurrency(raw.currency), }
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

// The products step sends the whole list every save, so an absent list means
// "unchanged" and an empty one means the owner removed everything.
function parseProducts(value: unknown, existing: OnboardingDraftPayload | null): DraftProductInput[] | null {
  if (value === undefined) {
    return existing ? existing.preview.products.map(product => ({
      name: product.name,
      category: product.collection,
      amountMinor: product.price === null ? null : product.price.unit_amount,
    })) : null
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): DraftProductInput[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const name = stringOrNull(record.name)
    if (!name) return []
    // A name is the only thing a product needs: `prices` is a separate table and
    // nothing in `products` requires a row in it. An absent or null amount means
    // unpriced; a present amount that is not a non-negative integer is a bad
    // entry and is dropped rather than rounded into a price nobody typed.
    const amountMinor = record.amountMinor
    if (amountMinor === undefined || amountMinor === null) {
      return [{ name, category: stringOrNull(record.category) ?? '', amountMinor: null }]
    }
    if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor < 0) return []
    return [{ name, category: stringOrNull(record.category) ?? '', amountMinor }]
  })
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
    brandColor: stringOrNull(raw?.brandColor) ?? stringOrNull(existingConfig.brand_color) ?? null, logoNote: stringOrNull(raw?.logoNote) ?? stringOrNull(existingConfig.draft_logo_note) ?? null, logoPreviewUrl: stringOrNull(raw?.logoPreviewUrl) ?? existingLogo?.publicUrl ?? null, heroPhotoNote: stringOrNull(raw?.heroPhotoNote) ?? stringOrNull(existingConfig.draft_hero_photo_note) ?? null, heroPreviewUrl: stringOrNull(raw?.heroPreviewUrl) ?? existingHero?.publicUrl ?? null, heroHeadline: stringOrNull(raw?.heroHeadline) ?? stringOrNull(existingConfig.draft_hero_headline) ?? existingHeroHeadline, heroSubtitle: stringOrNull(raw?.heroSubtitle) ?? stringOrNull(existingConfig.draft_hero_subtitle) ?? null, logoImage: imageFromBody(raw?.logoImage, existingLogo), heroImage: imageFromBody(raw?.heroImage, existingHero), }
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

  const previewSecret = previewSecretOf(env)
  if (!previewSecret) return jsonResponse({ error: 'Preview secret not configured' }, { status: 503 })

  const body = await readBody(event) as {
    sourceType?: unknown
    vertical?: unknown
    placeId?: unknown
    name?: unknown
    details?: Record<string, unknown> | null
    brandDraft?: Record<string, unknown> | null
    products?: unknown
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

  const rawDetails = body.details && typeof body.details === 'object' ? body.details : null
  const bodyName = stringOrNull(rawDetails?.name) ?? stringOrNull(body.name)
  const name = bodyName
    ?? place?.name
    ?? existingPayload?.source.details.name
    ?? existingPayload?.preview.brandName
    ?? ''
  if (!name) return jsonResponse({ error: 'name is required' }, { status: 400 })

  // An omitted country keeps the stored answer; a present but unrecognised one
  // is a bad request, not a reason to quietly keep the old value.
  if (rawDetails?.country !== undefined && rawDetails.country !== null && parseCountry(rawDetails.country) === null) {
    return jsonResponse({ error: 'country must be an ISO 3166-1 alpha-2 code' }, { status: 400 })
  }

  const details = detailsFromBody(rawDetails, existingPayload?.source.details ?? null, name, place)
  const brandDraft = brandFromBody(body.brandDraft && typeof body.brandDraft === 'object' ? body.brandDraft : null, existingPayload)
  const products = parseProducts(body?.products, existingPayload)
  const payload = buildOnboardingDraftPayload({
    name, vertical, place, details, brandDraft, products, })

  const draft = await upsertActiveOnboardingDraft(db, {
    // /dashboard/onboarding is the "New Organization" entry point, so a draft
    // never carries the session's active organization: the first save creates a
    // new one and records it here. Adding a site to an existing organization is
    // POST /api/sites from that organization's dashboard.
    userId: session.user.id, organizationId: null, name: payload.preview.brandName, vertical, sourceType, payload, })

  // The site is real from this first save: pending, on its own reserved
  // subdomain, previewable with its preview token and invisible to the public
  // until POST /api/dashboard/onboarding/activate. There is no separate draft
  // renderer — the preview is the site.
  const site = await ensureOnboardingSite(env, db, session.user.id, {
    id: draft.id,
    organization_id: draft.organizationId,
    name: payload.preview.brandName,
    vertical,
    subdomain_candidate: draft.subdomainCandidate,
  })
  if ('error' in site) return jsonResponse({ error: site.error }, { status: site.status })

  // Every save writes the owner's answers onto that site, so the preview is
  // never behind the conversation. Currency and timezone are only written once
  // they have actually been answered.
  const answeredTimezone = payload.source.details.timezone
  await applyOnboardingDraftToSite(env, db, {
    userId: session.user.id,
    target: site.target,
    payload,
    defaultCurrency: payload.source.details.currency,
    timezone: isValidTimezone(answeredTimezone) ? answeredTimezone : null,
  })

  const previewToken = await createPreviewToken(previewSecret, site.target.siteId, Date.now() + PREVIEW_TOKEN_TTL_MS)

  return jsonResponse({
    success: true,
    draftId: draft.id,
    draftName: payload.preview.brandName,
    siteId: site.target.siteId,
    subdomainCandidate: site.target.subdomain,
    previewToken,
  })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
