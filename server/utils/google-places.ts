// Google Places API (New, v1) — server-side only. Key stored as GOOGLE_PLACES_API_KEY CF secret.
// Never import this in client-side code.

const PLACES_BASE = 'https://places.googleapis.com/v1/places'

// Field masks — controls billing tier. We fetch all useful fields in one call.
// Basic: id, displayName, formattedAddress, location, googleMapsUri
// Contact (+$0.003/1k): nationalPhoneNumber, internationalPhoneNumber, websiteUri
// Atmosphere (+$0.005/1k): rating, userRatingCount, regularOpeningHours
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
  addressComponents?: Array<{ longText?: string; types?: string[] }>
}

function extractCity(components?: RawPlace['addressComponents']): string | null {
  if (!components) return null
  const cityTypes = ['locality', 'administrative_area_level_2', 'administrative_area_level_1']
  for (const type of cityTypes) {
    const comp = components.find(c => c.types?.includes(type))
    if (comp?.longText) return comp.longText
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
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
  }
}

export async function searchPlaces(apiKey: string, query: string): Promise<PlaceSearchResult[]> {
  const response = await fetch(`${PLACES_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Places search failed: ${response.status} ${text.slice(0, 200)}`)
  }

  const data = await response.json() as { places?: RawPlace[] }
  return (data.places ?? []).map(normalizeSearchResult)
}

export async function getPlaceDetails(apiKey: string, placeId: string): Promise<PlaceDetails> {
  const response = await fetch(`${PLACES_BASE}/${encodeURIComponent(placeId)}`, {
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
  return normalizeDetail(data)
}
