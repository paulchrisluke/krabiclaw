// Google Places API (New, v1) — server-side only. Key stored as GOOGLE_PLACES_API_KEY CF secret.
// Never import this in client-side code.
import type { D1Database } from '@cloudflare/workers-types'
import { execute } from '~/server/db'

const PLACES_BASE = 'https://places.googleapis.com/v1/places'

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

// Field masks — controls billing tier. We fetch all useful fields in one call.
// Basic: id, displayName, formattedAddress, location, googleMapsUri
// Contact (+$0.003/1k): nationalPhoneNumber, internationalPhoneNumber, websiteUri
// Atmosphere (+$0.005/1k): rating, userRatingCount, regularOpeningHours, reviews
// Photos: photos metadata is free in the detail response; fetching the actual image
//   via /v1/{name}/media is billed at $0.007/photo (first 5,000/month free)
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
  'reviews',
  'photos',
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

export interface PlaceReview {
  reviewId: string
  authorName: string
  authorPhotoUrl: string | null
  rating: number
  text: string | null
  publishedAt: string | null
}

export interface PlacePhoto {
  name: string          // e.g. "places/ChIJ.../photos/AUc7tXq..."
  widthPx: number
  heightPx: number
  photoUri: string      // resolved CDN URL (fetched via /media?skipHttpRedirect=true)
}

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
  openingHours: string[] | null
  reviews: PlaceReview[]
  photos: PlacePhoto[]
}

interface RawReview {
  name?: string
  rating?: number
  text?: { text?: string }
  authorAttribution?: { displayName?: string; photoUri?: string }
  publishTime?: string
}

interface RawPhoto {
  name?: string
  widthPx?: number
  heightPx?: number
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
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  addressComponents?: Array<{ longText?: string; types?: string[]; languageCode?: string }>
  reviews?: RawReview[]
  photos?: RawPhoto[]
}

// business_locations is source-locale (English) only — no locale column exists on it,
// unlike business_location_translations. languageCode=en on both API calls is the real
// fix; this only guards against Google still returning script-mismatched text (e.g. a
// component Google won't localize) so it never lands silently in that table.
const NON_LATIN_SCRIPT_RE = /[฀-๿一-鿿぀-ヿ가-힯؀-ۿЀ-ӿ]/

function scrubNonLatin(value: string | null): string | null {
  if (value && NON_LATIN_SCRIPT_RE.test(value)) return null
  return value
}

function extractCity(components?: RawPlace['addressComponents']): string | null {
  if (!components) return null
  // Some Thai subdistricts (locality) have no English name in Google's dataset even
  // with languageCode=en on the request — that field comes back Thai-only. Prefer an
  // explicitly English-tagged component for the type, then fall through to the next
  // type (e.g. administrative_area_level_2) rather than surfacing Thai script.
  const cityTypes = ['locality', 'administrative_area_level_2', 'administrative_area_level_1']
  for (const type of cityTypes) {
    const matches = components.filter(c => c.types?.includes(type) && c.longText)
    const preferred = matches.find(c => c.languageCode === 'en')
      ?? matches.find(c => c.longText && !NON_LATIN_SCRIPT_RE.test(c.longText))
    if (preferred?.longText) return preferred.longText
  }
  return null
}

function normalizeSearchResult(place: RawPlace): PlaceSearchResult {
  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? '',
    formattedAddress: scrubNonLatin(place.formattedAddress ?? '') ?? '',
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
  }
}

function normalizeDetail(place: RawPlace): Omit<PlaceDetails, 'photos'> & { rawPhotos: RawPhoto[] } {
  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? '',
    formattedAddress: scrubNonLatin(place.formattedAddress ?? '') ?? '',
    city: scrubNonLatin(extractCity(place.addressComponents)),
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    websiteUrl: place.websiteUri ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
    reviews: (place.reviews ?? []).map(r => ({
      reviewId: r.name ?? '',
      authorName: r.authorAttribution?.displayName ?? 'Anonymous',
      authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
      rating: Math.round(r.rating ?? 0),
      text: r.text?.text ?? null,
      publishedAt: r.publishTime ?? null,
    })),
    rawPhotos: place.photos ?? [],
  }
}

// Resolves up to `limit` photo CDN URLs from photo name references.
// Uses skipHttpRedirect=true so we get the URI directly without following a redirect.
// Billed at $0.007/photo after the free tier (5,000/month).
export async function fetchPlacePhotoUrls(
  apiKey: string,
  rawPhotos: RawPhoto[],
  limit = 5,
): Promise<PlacePhoto[]> {
  const fetch1Photo = async (raw: RawPhoto): Promise<PlacePhoto | null> => {
    if (!raw.name) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    try {
      const url = `https://places.googleapis.com/v1/${raw.name}/media?key=${apiKey}&maxHeightPx=1600&maxWidthPx=1600&skipHttpRedirect=true`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      const data = await res.json() as { photoUri?: string }
      if (!data.photoUri) return null
      return { name: raw.name, widthPx: raw.widthPx ?? 0, heightPx: raw.heightPx ?? 0, photoUri: data.photoUri }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  const settled = await Promise.allSettled(rawPhotos.slice(0, limit).map(fetch1Photo))
  return settled
    .filter((r): r is PromiseFulfilledResult<PlacePhoto> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
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

  await execute(db, `
    UPDATE business_locations SET
      phone = COALESCE(?, phone),
      website_url = COALESCE(?, website_url),
      city = COALESCE(?, city),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      maps_url = COALESCE(?, maps_url),
      opening_hours = COALESCE(?, opening_hours),
      rating = COALESCE(?, rating),
      review_count = COALESCE(?, review_count),
      last_synced_at = ?,
      updated_at = ?
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `, [
    place.phone,
    place.websiteUrl,
    place.city,
    place.lat,
    place.lng,
    place.mapsUrl,
    place.openingHours ? JSON.stringify(place.openingHours) : null,
    place.rating,
    place.ratingCount,
    now,
    now,
    locationId,
    organizationId,
    siteId
  ])

  // Upsert reviews — skip any already imported (deduped by google_review_id)
  let reviewsUpserted = 0
  for (const review of place.reviews) {
    if (!review.reviewId || !review.rating) continue
    const result = await execute(db, `
      INSERT OR IGNORE INTO reviews
        (id, organization_id, site_id, location_id, google_review_id,
         author_name, reviewer_photo_url, rating, content,
         status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'google_places', ?, ?)
    `, [
      `gplaces-${review.reviewId.replace(/\//g, '-')}`,
      organizationId,
      siteId,
      locationId,
      review.reviewId,
      review.authorName,
      review.authorPhotoUrl,
      review.rating,
      review.text,
      review.publishedAt ?? now,
      now
    ])
    if (result.meta.changes > 0) reviewsUpserted++
  }

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

function extractPlaceIdFromUrl(url: string): string | null {
  const match = url.match(/!1s(ChIJ[^!&%]+)/)
  if (match?.[1]) {
    try { return decodeURIComponent(match[1]) } catch { return match[1] }
  }
  return null
}

function extractNameAndCoordsFromUrl(url: string): { name: string | null; lat: number | null; lng: number | null } {
  let name: string | null = null
  let lat: number | null = null
  let lng: number | null = null
  const pathMatch = url.match(/\/maps\/place\/([^/@]+)/)
  if (pathMatch?.[1]) {
    try { name = decodeURIComponent(pathMatch[1].replace(/\+/g, ' ')) } catch { name = pathMatch[1] }
  }
  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordMatch?.[1] && coordMatch?.[2]) {
    lat = parseFloat(coordMatch[1])
    lng = parseFloat(coordMatch[2])
  }
  return { name, lat, lng }
}

async function resolveShortUrl(url: string): Promise<string> {
  let parsed: URL
  try { parsed = new URL(url) } catch { return url }
  if (parsed.protocol !== 'https:') return url
  if (!['maps.app.goo.gl', 'goo.gl', 'share.google'].includes(parsed.hostname)) return url
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(parsed.toString(), { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    return res.url || url
  } catch { return url } finally { clearTimeout(timeout) }
}

export async function getPlaceDetailsByUrl(
  apiKey: string,
  mapsUrl: string,
  fetchPhotos = true,
  photoLimit = 5,
): Promise<PlaceDetails> {
  const resolved = await resolveShortUrl(mapsUrl)
  const placeId = extractPlaceIdFromUrl(resolved)
  if (placeId) {
    return getPlaceDetails(apiKey, placeId, fetchPhotos, photoLimit)
  }

  // URL uses hex-format or feature ID — extract name + coords and search instead
  const { name, lat, lng } = extractNameAndCoordsFromUrl(resolved)
  if (!name) {
    throw new PlaceDetailsError('Could not identify the business from this URL. Copy the full Google Maps link directly from your browser address bar.', 422)
  }
  const locationBias = (lat !== null && lng !== null)
    ? { latitude: lat, longitude: lng, radiusMeters: 2000 }
    : undefined
  const results = await searchPlaces(apiKey, name, locationBias)
  const top = results[0]
  if (!top?.placeId) {
    throw new PlaceDetailsError(`Could not find "${name}" on Google. Try pasting the link from a desktop browser, or use the Facebook or manual option.`, 422)
  }
  return getPlaceDetails(apiKey, top.placeId, fetchPhotos, photoLimit)
}

export async function getPlaceDetails(
  apiKey: string,
  placeId: string,
  fetchPhotos = true,
  photoLimit = 5,
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

  const data = await response.json() as RawPlace
  const { rawPhotos, ...detail } = normalizeDetail(data)
  const photos = fetchPhotos ? await fetchPlacePhotoUrls(apiKey, rawPhotos, photoLimit) : []
  return { ...detail, photos }
}
