import { applicationFetch, dashboardFetch, useDashboardRouteScope } from '~/composables/dashboardFetch'
import { isRecord } from '~/utils/api-clients'
import { parseOpeningHours, parseSpecialHours, type OpeningHours } from '~/shared/reservation-hours'
import { parsePhone } from '~/utils/phone'
import { composePostalAddress } from '~/utils/postal-address'
import { useOnboardingState, type OnboardingPlacePreview } from '~/composables/useOnboardingFlow'

/**
 * Every server call the flow makes, and the shapes they answer with. The step
 * screens own presentation and nothing else; this owns the draft.
 */
export function useOnboardingDraft() {
  const state = useOnboardingState()
  const routeScope = useDashboardRouteScope()
  const busy = ref(false)
  const error = ref<string | null>(null)
  const { trackSiteCreated } = useAnalytics()

  /** The address as the review step shows it, on one line. */
  function addressSummary() {
    return composePostalAddress(addressParts()).split('\n').join(', ')
  }

  /**
   * The address one field per answer. The server composes the single line a
   * location stores; sending it from here as well would give one fact two
   * sources, and persisting only the composed line is what made a resumed
   * draft show "United States" as its street address.
   */
  function addressParts() {
    const details = state.value.details
    return {
      streetAddress: details.streetAddress,
      addressLine2: details.addressLine2,
      city: details.city,
      region: details.region,
      postalCode: details.postalCode,
      country: details.country,
      streetIsFormatted: state.value.place !== null,
    }
  }

  /**
   * POST /api/dashboard/locations is route-scoped: it resolves the site
   * from the `org` and `site` query the dashboard transport sends, and refuses
   * the request without them. The unscoped transport is for the new-site flow,
   * which has no organization yet.
   */
  function locationsAddFetch<T>(options: Parameters<typeof dashboardFetch<T>>[2]) {
    const scope = routeScope.value
    if (!scope) {
      throw new Error('Adding a location needs a /dashboard/{orgSlug}/sites/{siteSlug} route.')
    }
    return dashboardFetch<T>('/api/dashboard/locations', scope, options)
  }

  function serializeDetails() {
    const details = state.value.details
    return {
      name: details.name.trim(),
      country: details.country.trim().toUpperCase() || null,
      city: details.city.trim() || null,
      streetAddress: details.streetAddress.trim() || null,
      addressLine2: details.addressLine2.trim() || null,
      region: details.region.trim() || null,
      postalCode: details.postalCode.trim() || null,
      phone: details.phone.trim() || null,
      openingHours: parseOpeningHours(state.value.hours.hours),
      specialHours: parseSpecialHours(state.value.hours.specialHours),
      notificationPhone: details.phone.trim() || null,
      timezone: state.value.hours.timezone.trim() || null,
      currency: details.currency ?? null,
    }
  }

  function serializeBrandDraft() {
    const brand = state.value.brand
    return {
      brandColor: brand.brandColor.trim() || null,
      logoNote: brand.logoNote.trim() || null,
      logoPreviewUrl: brand.logoPreviewUrl.trim() || null,
      heroPhotoNote: brand.heroPhotoNote.trim() || null,
      heroPreviewUrl: brand.heroPreviewUrl.trim() || null,
      logoImage: brand.logoImage,
      heroImage: brand.heroImage,
      heroHeadline: brand.heroHeadline.trim() || null,
      heroSubtitle: brand.heroSubtitle.trim() || null,
    }
  }

  function serializeProducts() {
    return state.value.products
      .filter(product => product.name.trim())
      .map(product => ({
        name: product.name.trim(),
        category: product.category.trim(),
        amountMinor: product.amountMinor,
      }))
  }

  /** Save the answers so far. Every step calls this; the site follows the draft. */
  async function save(): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const res = await applicationFetch<Record<string, unknown>>('/api/dashboard/onboarding/drafts/active', {
        method: 'POST',
        body: {
          sourceType: state.value.source ?? 'manual',
          placeId: state.value.place?.placeId,
          name: state.value.details.name.trim(),
          vertical: state.value.vertical,
          details: serializeDetails(),
          brandDraft: serializeBrandDraft(),
          products: serializeProducts(),
        },
        validate: (value): value is Record<string, unknown> => isRecord(value),
      })
      if (res.success !== true || typeof res.draftId !== 'string' || typeof res.siteId !== 'string'
        || typeof res.previewToken !== 'string' || typeof res.draftName !== 'string'
        || typeof res.subdomainCandidate !== 'string') {
        throw new Error(typeof res.error === 'string' ? res.error : 'Could not save your answers. Please try again.')
      }
      state.value.draftId = res.draftId
      state.value.preview = {
        draftId: res.draftId, siteId: res.siteId, previewToken: res.previewToken,
        draftName: res.draftName, subdomainCandidate: res.subdomainCandidate,
      }
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * Read a Google Maps link into the flow's place snapshot. POST
   * /api/dashboard/locations owns both the preview and the mutation for an
   * existing site's locations, so add-location reads its listing from there;
   * new-site has no site yet and reads from the onboarding preview endpoint.
   */
  async function lookup(mapsUrl: string): Promise<boolean> {
    busy.value = true
    error.value = null
    state.value.mapsUrl = mapsUrl
    const request = {
      method: 'POST' as const,
      body: { mapsUrl, previewOnly: true },
      validate: (value: unknown): value is Record<string, unknown> => isRecord(value),
    }
    try {
      const res = state.value.flow === 'add-location'
        ? await locationsAddFetch<Record<string, unknown>>(request)
        : await applicationFetch<Record<string, unknown>>('/api/dashboard/onboarding/places-preview', request)
      const preview = isRecord(res.preview) ? res.preview as unknown as OnboardingPlacePreview : null
      if (res.success !== true || !preview?.placeId) {
        throw new Error(typeof res.error === 'string' ? res.error : 'Could not find your business. Check the link and try again.')
      }
      state.value.place = preview
      seedFromPlace(preview)
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  function seedFromPlace(preview: OnboardingPlacePreview) {
    const details = state.value.details
    details.name = preview.name ?? ''
    details.city = preview.city ?? ''
    details.streetAddress = preview.address ?? ''
    details.addressLine2 = ''
    details.region = ''
    details.postalCode = ''
    details.country = ''
    // Google returns the national format, which carries no country and cannot be
    // stored at the E.164 boundary. Seed it only when it parses on its own.
    details.phone = parsePhone(preview.phone ?? '').e164 ?? ''
    state.value.hours.hours = parseOpeningHours((preview.openingHours ?? null) as OpeningHours)
    state.value.hours.specialHours = null
    state.value.hours.timezone = preview.timezone ?? ''
  }

  /** Make the pending site public. */
  async function activate(): Promise<boolean> {
    const draftId = state.value.draftId
    if (!draftId) {
      error.value = 'No draft is ready yet.'
      return false
    }
    busy.value = true
    error.value = null
    try {
      const res = await applicationFetch<Record<string, unknown>>(
        `/api/dashboard/onboarding/drafts/${draftId}/activate`,
        { method: 'POST', validate: (value): value is Record<string, unknown> => isRecord(value) },
      )
      if (res.success !== true) {
        throw new Error(typeof res.error === 'string' ? res.error : 'Failed to create your site. Please try again.')
      }
      state.value.created = {
        orgSlug: typeof res.orgSlug === 'string' ? res.orgSlug : null,
        siteSlug: typeof res.siteSlug === 'string' ? res.siteSlug : null,
        locationSlug: typeof res.locationSlug === 'string' ? res.locationSlug : null,
      }
      if (typeof res.siteId === 'string') trackSiteCreated(res.siteId)
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * Add the collected location to the site the dashboard route is already on.
   * There is no draft in this flow: nothing is saved until this one call, which
   * both creates the location and (on the Google path) imports its reviews.
   */
  async function addLocation(): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const place = state.value.place
      const res = await locationsAddFetch<Record<string, unknown>>({
        method: 'POST',
        body: place
          ? { placeId: place.placeId, details: serializeDetails() }
          : { name: state.value.details.name.trim(), details: serializeDetails() },
        validate: (value): value is Record<string, unknown> => isRecord(value),
      })
      if (res.success !== true) {
        throw new Error(typeof res.error === 'string' ? res.error : 'Could not add your location. Please try again.')
      }
      state.value.created = {
        orgSlug: typeof res.orgSlug === 'string' ? res.orgSlug : null,
        siteSlug: typeof res.siteSlug === 'string' ? res.siteSlug : null,
        locationSlug: typeof res.locationSlug === 'string' ? res.locationSlug : null,
      }
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * The pending site the caller's own active draft owns, or null when they have
   * no draft.
   *
   * DELETE /api/dashboard/onboarding/drafts/active acts on the caller's draft,
   * not on a site named in the request, so a surface that offers Discard has to
   * know which site that is. Offering it on a pending site belonging to someone
   * else's draft would delete the caller's own draft somewhere else — the same
   * shape of bug as resolving an ambiguous target instead of refusing it.
   *
   * Deliberately unguarded: a caller that cannot read this does not know what
   * Discard would delete, and has to say so rather than offer the control
   * anyway or hide it without a reason.
   */
  async function activeDraftSiteId(): Promise<string | null> {
    const res = await applicationFetch<Record<string, unknown>>('/api/dashboard/onboarding/drafts/active', {
      validate: (value): value is Record<string, unknown> => isRecord(value),
    })
    const draft = isRecord(res.draft) ? res.draft : null
    return draft && typeof draft.siteId === 'string' ? draft.siteId : null
  }

  /**
   * Abandon the draft and delete the pending site it created.
   *
   * The endpoint refuses rather than half-deleting: 409 when the site is
   * already live, 403 when the caller is not an owner of its organization, 500
   * when the delete left the site standing — and it leaves the draft open on
   * every refusal. Its message is the one the caller shows, because the
   * previous client swallowed the response and cleared local state regardless,
   * which is exactly what made those refusals invisible.
   */
  async function discard(): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const res = await applicationFetch<Record<string, unknown>>('/api/dashboard/onboarding/drafts/active', {
        method: 'DELETE',
        validate: (value): value is Record<string, unknown> => isRecord(value),
      })
      if (res.success !== true) {
        throw new Error(typeof res.error === 'string' ? res.error : 'Could not discard your unfinished site. Please try again.')
      }
      // The endpoint answers `deleted: false` when the caller has no active
      // draft any more — it activated, or another tab discarded it. Nothing was
      // removed, so reporting this as done would close the dialog over a site
      // that is still there. Say what actually happened.
      if (res.deleted !== true) {
        throw new Error('Nothing was discarded: you no longer have an unfinished site. Reload this page to see its current state.')
      }
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  /** Read the unfinished draft back into the flow. Returns false when there is none. */
  async function restore(): Promise<boolean> {
    try {
      const res = await applicationFetch<Record<string, unknown>>('/api/dashboard/onboarding/drafts/active', {
        validate: (value): value is Record<string, unknown> => isRecord(value),
      })
      const draft = isRecord(res.draft) ? res.draft : null
      if (!draft || typeof draft.draftId !== 'string') return false
      const details = isRecord(draft.details) ? draft.details : {}
      const config = isRecord(draft.config) ? draft.config : {}
      const text = (value: unknown) => typeof value === 'string' ? value : ''
      // Parse before touching state. These throw on stored hours that no longer
      // parse, and assigning as we went left the flow half-restored — name and
      // address in place, hours silently empty — which the next save would have
      // written back over the hours the owner had already given.
      const openingHours = parseOpeningHours(details.openingHours as OpeningHours)
      const specialHours = parseSpecialHours(details.specialHours)

      state.value.draftId = draft.draftId
      state.value.vertical = draft.vertical === 'experience' || draft.vertical === 'service' ? draft.vertical : 'restaurant'
      state.value.source = draft.sourceType === 'google_places' ? 'google_places' : 'manual'
      state.value.details.name = text(details.name)
      state.value.details.city = text(details.city)
      state.value.details.streetAddress = text(details.streetAddress)
      state.value.details.addressLine2 = text(details.addressLine2)
      state.value.details.region = text(details.region)
      state.value.details.postalCode = text(details.postalCode)
      state.value.details.phone = text(details.phone)
      if (typeof details.country === 'string' && details.country) state.value.details.country = details.country
      if (typeof details.currency === 'string' && details.currency) {
        state.value.details.currency = details.currency as typeof state.value.details.currency
      }
      state.value.hours.timezone = text(details.timezone)
      state.value.hours.hours = openingHours
      state.value.hours.specialHours = specialHours
      state.value.brand.brandColor = text(config.brand_color)
      state.value.brand.logoNote = text(config.draft_logo_note)
      state.value.brand.heroPhotoNote = text(config.draft_hero_photo_note)
      state.value.brand.heroHeadline = text(config.draft_hero_headline)
      state.value.brand.heroSubtitle = text(config.draft_hero_subtitle)
      state.value.products = Array.isArray(draft.products)
        ? draft.products.flatMap(entry => isRecord(entry) && typeof entry.name === 'string'
          ? [{
              name: entry.name,
              category: typeof entry.category === 'string' ? entry.category : '',
              amountMinor: typeof entry.amountMinor === 'number' ? entry.amountMinor : null,
            }]
          : [])
        : []

      if (typeof draft.siteId === 'string' && typeof draft.previewToken === 'string' && typeof draft.subdomainCandidate === 'string') {
        state.value.preview = {
          draftId: draft.draftId,
          siteId: draft.siteId,
          previewToken: draft.previewToken,
          draftName: typeof draft.draftName === 'string' ? draft.draftName : state.value.details.name,
          subdomainCandidate: draft.subdomainCandidate,
        }
      }
      return true
    } catch {
      // An unreadable draft is not worth blocking the flow for.
      return false
    }
  }

  return { busy, error, save, lookup, activate, addLocation, restore, activeDraftSiteId, discard, addressSummary }
}
