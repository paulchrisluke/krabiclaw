import { normalizeGoogleOpeningHours, type OpeningHours } from '~/shared/reservation-hours'
import { serializeOpeningHours } from '~/server/utils/location-management'
import type { D1Database } from '@cloudflare/workers-types'
import { normalizeGoogleReview, type GoogleReview } from '~/shared/google-review'
import { executeBatch } from '~/server/db'

const PLACES_BASE = 'https://places.googleapis.com/v1/places'

// Generate a canonical Google Maps embed URL from the location data already
// stored by the Places importer. This helper does not call Google.
export const calculateMapEmbedUrl = (loc: {
  title: string
  maps_url?: string | null
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  city?: string | null
}) => {
  if (loc.maps_url) {
    try {
      const url = new URL(loc.maps_url)
      const cid = url.searchParams.get('cid')
      if (cid) return `https://maps.google.com/maps?cid=${cid}&output=embed`
    } catch { /* use the next available source */ }
  }

  if (loc.latitude != null && loc.longitude != null) {
    return `https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&output=embed`
  }

  let address = loc.address || loc.city || ''
  if (address.startsWith('{')) {
    try {
      const parsed = JSON.parse(address) as { addressLines?: string[]; streetAddress?: string }
      address = parsed.addressLines?.[0] || parsed.streetAddress || loc.city || ''
    } catch { /* use the raw address */ }
  }

  if (!address) return null
  const query = loc.title ? `${loc.title}, ${address}` : address
  return `https://maps.google.com/maps?q=${encodeURIComponent(String(query))}&output=embed`
}

export class PlaceDetailsError extends Error {
  public readonly statusCode: number

  constructor(
    message: string,
    statusCode: number = 502
  ) {
    super(message)
    this.name = 'PlaceDetailsError'
    this.statusCode = statusCode
  }
}

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
].join(',')

const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'googleMapsUri',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'timeZone',
  'reviews',
].join(',')

export interface PlaceSearchResult {
  placeId: string
  name: string
  formattedAddress: string
  lat: number | null
  lng: number | null
  mapsUrl: string | null
  phone: string | null
  rating: number | null
  ratingCount: number | null
}

export type PlaceReview = GoogleReview

export interface PlaceDetails {
  placeId: string
  name: string
  formattedAddress: string
  city: string | null
  lat: number | null
  lng: number | null
  mapsUrl: string | null
  phone: string | null
  websiteUrl: string | null
  rating: number | null
  ratingCount: number | null
  timezone: string | null
  openingHours: OpeningHours
  reviews: PlaceReview[]
}

interface RawPlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  googleMapsUri?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  regularOpeningHours?: { periods?: unknown[] }
  timeZone?: { id?: string }
  addressComponents?: Array<{ longText?: string; types?: string[]; languageCode?: string }>
  reviews?: unknown[]
}

function extractCity(components?: RawPlace['addressComponents']): string | null {
  if (!components) return null
  for (const type of ['locality', 'administrative_area_level_2', 'administrative_area_level_1']) {
    const component = components.find(component => component.types?.includes(type) && component.longText)
    if (component?.longText) return component.longText
  }
  return null
}

function normalizeSearchResult(place: RawPlace): PlaceSearchResult {
  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? '',
    formattedAddress: place.formattedAddress ?? '',
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
  }
}

function normalizeDetail(place: RawPlace): PlaceDetails {
  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? '',
    formattedAddress: place.formattedAddress ?? '',
    city: extractCity(place.addressComponents),
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    websiteUrl: place.websiteUri ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    timezone: place.timeZone?.id ?? null,
    openingHours: normalizeGoogleOpeningHours(place.regularOpeningHours?.periods),
    reviews: (place.reviews ?? []).map(normalizeGoogleReview),
  }
}

export function googleReviewUpserts(scope: { organizationId: string; siteId: string; locationId: string }, reviews: PlaceReview[], now: string) {
  const { organizationId, siteId, locationId } = scope
  return reviews.map(review => {
    const reviewId = `gplaces-${locationId}-${review.google_review_id.replace(/\//g, '-')}`
    return {
      query: `INSERT INTO reviews (id, organization_id, site_id, location_id, google_review_id, author_name, rating, content,
        original_review_date, original_reference, google_review_metadata, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'google_places', ?, ?)
        ON CONFLICT(organization_id, site_id, location_id, google_review_id) DO UPDATE SET
          author_name = excluded.author_name, rating = excluded.rating, content = excluded.content,
          original_review_date = excluded.original_review_date, original_reference = excluded.original_reference,
          google_review_metadata = excluded.google_review_metadata, updated_at = excluded.updated_at`,
      params: [reviewId, organizationId, siteId, locationId, review.google_review_id, review.author_name, review.rating, review.content,
        review.original_review_date, review.original_reference, JSON.stringify(review.google_review_metadata), now, now],
    }
  })
}

export async function syncPlaceToLocation(
  db: D1Database,
  apiKey: string,
  organizationId: string,
  siteId: string,
  locationId: string,
  placeId: string
): Promise<{ place: PlaceDetails; reviewsUpserted: number }> {
  const place = await getPlaceDetails(apiKey, placeId)
  const now = new Date().toISOString()

  const results = await executeBatch(db, [{ query: `
    UPDATE business_locations SET
      phone = COALESCE(?, phone),
      website_url = COALESCE(?, website_url),
      city = COALESCE(?, city),
      address = ?,
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      maps_url = COALESCE(?, maps_url),
      opening_hours = ?,
      timezone = COALESCE(?, timezone),
      rating = COALESCE(?, rating),
      review_count = COALESCE(?, review_count),
      last_synced_at = ?,
      updated_at = ?
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `, params: [
    place.phone,
    place.websiteUrl,
    place.city,
    JSON.stringify({ addressLines: [place.formattedAddress] }),
    place.lat,
    place.lng,
    place.mapsUrl,
    serializeOpeningHours(place.openingHours),
    place.timezone,
    place.rating,
    place.ratingCount,
    now,
    now,
    locationId,
    organizationId,
    siteId
  ] }, ...googleReviewUpserts({ organizationId, siteId, locationId }, place.reviews, now)])
  const reviewsUpserted = results.slice(1).reduce((count, result) => count + Number(result.meta?.changes ?? 0), 0)

  return { place, reviewsUpserted }
}

export async function searchPlaces(
  apiKey: string,
  query: string,
  locationBias?: { latitude: number; longitude: number; radiusMeters?: number },
): Promise<PlaceSearchResult[]> {
  const body: Record<string, unknown> = { textQuery: query, maxResultCount: 5, languageCode: 'en' }
  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
        radius: locationBias.radiusMeters ?? 500,
      },
    }
  }
  const response = await fetch(`${PLACES_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places search failed: ${response.status} ${text.slice(0, 200)}`)
  }

  const data = await response.json() as { places?: RawPlace[] }
  return (data.places ?? []).map(normalizeSearchResult)
}

// ---------------------------------------------------------------------------
// Google Maps link -> place ID. The one resolver for every surface that accepts
// a pasted link: the onboarding wizard (places-preview), add-location, and the
// ChatGPT MCP import_from_maps tool. Every failure is a PlaceDetailsError whose
// message is written for the owner and shown verbatim.
// ---------------------------------------------------------------------------

const MAPS_LINK_HELP = 'Open your listing in Google Maps, use Share → Copy link, and paste that link here.'
const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'share.google']
const MAX_CANDIDATE_DISTANCE_KM = 5

export interface GoogleMapsSignals {
  nameHint: string | null
  lat: number | null
  lng: number | null
  /** A canonical `ChIJ...` place ID carried by the link, or null. */
  placeId: string | null
}

export interface GoogleMapsPlaceCandidate {
  placeId?: string | null
  lat?: number | null
  lng?: number | null
}

export interface GoogleMapsPlaceResolution {
  placeId: string
  resolvedUrl: string
  usedTextSearch: boolean
}

interface GoogleMapsPlaceResolverDependencies {
  resolveShortLink: (url: string) => Promise<{ ok: boolean; url: string }>
  searchPlaces: (
    query: string,
    locationBias: { latitude: number; longitude: number },
  ) => Promise<GoogleMapsPlaceCandidate[]>
}

// Google Maps links arrive on whichever Google domain the owner's browser was
// on: google.com, google.de, google.co.uk, maps.google.fr. All of them are
// Google; anything that merely ends in a Google-looking string is not.
const GOOGLE_DOMAIN_PATTERN = /^(?:[a-z0-9-]+\.)*google(?:\.[a-z]{2,3})?\.[a-z]{2,3}$/

export function isAllowedGoogleMapsHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (SHORT_LINK_HOSTS.includes(h)) return true
  return GOOGLE_DOMAIN_PATTERN.test(h)
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function validCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  ) {
    return { lat, lng }
  }
  return null
}

// Link shapes an owner actually copies:
//  - https://www.google.com/maps/search/?api=1&query=...&query_place_id=ChIJ...
//  - any URL carrying a `!1sChIJ...` data segment
//  - https://www.google.com/maps/place/<Name>/@<lat>,<lng>,17z[/data=...!1s0x...:0x...!3d<lat>!4d<lng>]
//    (the desktop address bar, and what maps.app.goo.gl short links resolve to)
export function extractGoogleMapsSignals(resolvedUrl: string): GoogleMapsSignals {
  let placeId: string | null
  try {
    placeId = new URL(resolvedUrl).searchParams.get('query_place_id')
  } catch { placeId = null }
  if (!placeId) {
    // A Maps URL carries several !1s segments; only the canonical place id
    // starts with ChIJ, and it is not always the first one.
    const rawIdMatch = resolvedUrl.match(/!1s(ChIJ[^!&]*)/)
    if (rawIdMatch?.[1]) {
      try { placeId = decodeURIComponent(rawIdMatch[1]) } catch { placeId = null }
    }
  }
  if (placeId && !/^ChIJ/.test(placeId)) placeId = null

  const nameFromPath = resolvedUrl.match(/\/maps\/place\/([^/@?]+)/)?.[1]
  let nameHint: string | null = null
  if (nameFromPath) {
    try { nameHint = decodeURIComponent(nameFromPath.replace(/\+/g, ' ')).trim() || null } catch { nameHint = null }
  }

  // !3d/!4d are the exact business coords; @ is the map viewport (less precise)
  const coordinatePattern = '-?\\d+(?:\\.\\d+)?'
  const lat3d = resolvedUrl.match(new RegExp(`!3d(${coordinatePattern})`))?.[1]
  const lng4d = resolvedUrl.match(new RegExp(`!4d(${coordinatePattern})`))?.[1]
  const viewportMatch = resolvedUrl.match(new RegExp(`@(${coordinatePattern}),(${coordinatePattern})`))
  const latRaw = lat3d ?? viewportMatch?.[1] ?? null
  const lngRaw = lng4d ?? viewportMatch?.[2] ?? null
  const lat = latRaw != null ? Number(latRaw) : null
  const lng = lngRaw != null ? Number(lngRaw) : null

  return { nameHint, lat, lng, placeId }
}

// A link without a place ID becomes a text search biased to the link's
// coordinates. The top result is accepted only when it sits within
// MAX_CANDIDATE_DISTANCE_KM of those coordinates; Google's locationBias is a
// hint, and without the distance check a misspelt name returned a fuzzy match
// 2,000 km away. Callers still show the result to the owner to confirm.
export async function resolveGoogleMapsPlace(
  rawUrl: string,
  dependencies: GoogleMapsPlaceResolverDependencies,
): Promise<GoogleMapsPlaceResolution> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new PlaceDetailsError(`That doesn't look like a web link. ${MAPS_LINK_HELP}`, 422)
  }

  if (parsedUrl.protocol !== 'https:' || !isAllowedGoogleMapsHost(parsedUrl.hostname)) {
    throw new PlaceDetailsError(`That isn't a Google Maps link. ${MAPS_LINK_HELP}`, 422)
  }

  let resolvedUrl = parsedUrl.toString()
  if (SHORT_LINK_HOSTS.includes(parsedUrl.hostname.toLowerCase())) {
    let probe: { ok: boolean; url: string }
    try {
      probe = await dependencies.resolveShortLink(parsedUrl.toString())
    } catch {
      throw new PlaceDetailsError("We couldn't open that Google Maps share link. Try again in a moment.", 502)
    }

    let resolvedHost: string | null
    try { resolvedHost = new URL(probe.url).hostname } catch { resolvedHost = null }
    if (!probe.ok || !resolvedHost || !isAllowedGoogleMapsHost(resolvedHost)) {
      throw new PlaceDetailsError(`That share link didn't lead to a place on Google Maps. ${MAPS_LINK_HELP}`, 422)
    }
    resolvedUrl = probe.url
  }

  const signals = extractGoogleMapsSignals(resolvedUrl)
  if (signals.placeId) {
    return { placeId: signals.placeId, resolvedUrl, usedTextSearch: false }
  }

  if (!signals.nameHint) {
    throw new PlaceDetailsError(`We couldn't find a business in that link. ${MAPS_LINK_HELP}`, 422)
  }
  const urlCoordinates = validCoordinates(signals.lat, signals.lng)
  if (!urlCoordinates) {
    throw new PlaceDetailsError(`That link doesn't include where "${signals.nameHint}" is on the map. ${MAPS_LINK_HELP}`, 422)
  }

  const locationBias = { latitude: urlCoordinates.lat, longitude: urlCoordinates.lng }
  let results: GoogleMapsPlaceCandidate[]
  try {
    results = await dependencies.searchPlaces(signals.nameHint, locationBias)
  } catch (error) {
    console.error({ event: 'google_places_search_failed', message: error instanceof Error ? error.message : String(error) })
    throw new PlaceDetailsError('Google Maps search failed. Try again in a moment.', 502)
  }

  const candidate = results[0]
  if (!candidate?.placeId) {
    throw new PlaceDetailsError(`We couldn't find "${signals.nameHint}" on Google Maps near the spot in that link. ${MAPS_LINK_HELP}`, 404)
  }
  const candidateCoordinates = validCoordinates(candidate.lat, candidate.lng)
  if (!candidateCoordinates) {
    throw new PlaceDetailsError(`Google Maps returned "${signals.nameHint}" without a location, so we couldn't confirm it is the business in your link. ${MAPS_LINK_HELP}`, 422)
  }

  const distanceKm = haversineKm(locationBias.latitude, locationBias.longitude, candidateCoordinates.lat, candidateCoordinates.lng)
  if (distanceKm > MAX_CANDIDATE_DISTANCE_KM) {
    throw new PlaceDetailsError(`The closest match for "${signals.nameHint}" is ${Math.round(distanceKm)} km from the spot in your link, so it's probably not your business. ${MAPS_LINK_HELP}`, 404)
  }

  return { placeId: candidate.placeId, resolvedUrl, usedTextSearch: true }
}

export async function getPlaceDetailsByUrl(
  apiKey: string,
  mapsUrl: string,
): Promise<PlaceDetails> {
  const { placeId } = await resolveGoogleMapsPlace(mapsUrl, {
    resolveShortLink: async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      return { ok: response.ok, url: response.url }
    },
    searchPlaces: (query, locationBias) => searchPlaces(apiKey, query, locationBias),
  })
  return getPlaceDetails(apiKey, placeId)
}

export async function getPlaceDetails(
  apiKey: string,
  placeId: string,
): Promise<PlaceDetails> {
  const response = await fetch(`${PLACES_BASE}/${encodeURIComponent(placeId)}?languageCode=en`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAIL_FIELD_MASK,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places detail failed: ${response.status} ${text.slice(0, 200)}`)
  }

  return normalizeDetail(await response.json() as RawPlace)
}
