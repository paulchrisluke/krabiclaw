/**
 * A postal address, exactly as the Places API (New) returns it.
 *
 * `GET https://places.googleapis.com/v1/places/{id}` answers a `postalAddress`
 * of type `google.type.PostalAddress`, and that is what `business_locations.address`
 * stores — unchanged, un-flattened, un-recomposed. One shape from the API we
 * call, through the column, to the page.
 *
 * `addressLines` is ordered and unbounded because addresses are: Pottery House
 * Krabi has three. `sublocality` is a real part of a Thai address ("Ao Nang",
 * "Nong Thale") that a flat line1/line2/city/state model has nowhere to put.
 *
 * `revision`, `sortingCode`, `recipients` and `organization` are omitted: Places
 * never populates them for a business.
 */
export interface PostalAddress {
  /** ISO 3166-1 alpha-2, as `google.type.PostalAddress.regionCode`. */
  regionCode: string
  addressLines: string[]
  /** BCP-47, present when the address is written in a specific language. */
  languageCode?: string
  locality?: string
  sublocality?: string
  administrativeArea?: string
  postalCode?: string
}

const OPTIONAL_TEXT = ['languageCode', 'locality', 'sublocality', 'administrativeArea', 'postalCode'] as const

/**
 * Read a stored or submitted address.
 *
 * D1 has no JSON type, so the column hands us text and a request body hands us
 * the parsed object; both arrive here and leave as one shape. An address that
 * does not match throws, because the column's CHECK constraint permits nothing
 * else — an unreadable value is a real failure, not a value to guess at.
 */
export function parsePostalAddress(value: unknown): PostalAddress | null {
  if (value === null || value === undefined || value === '') return null
  const source: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new TypeError('A postal address is an object')
  }
  const record = source as Record<string, unknown>
  if (typeof record.regionCode !== 'string' || !record.regionCode.trim()) {
    throw new TypeError('A postal address names its regionCode')
  }
  if (!Array.isArray(record.addressLines) || !record.addressLines.every(line => typeof line === 'string')) {
    throw new TypeError('A postal address carries addressLines as strings')
  }
  const address: PostalAddress = {
    regionCode: record.regionCode,
    addressLines: record.addressLines.filter(line => line.trim().length > 0),
  }
  for (const field of OPTIONAL_TEXT) {
    const part = record[field]
    if (part === undefined || part === null) continue
    if (typeof part !== 'string') throw new TypeError(`A postal address writes ${field} as text`)
    if (part.trim()) address[field] = part
  }
  return address
}

/** The address on one line, the way a guest reads it. */
export function formatPostalAddress(address: PostalAddress | null): string {
  if (!address) return ''
  return [...address.addressLines, address.sublocality, address.locality, address.administrativeArea, address.postalCode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ')
}

/**
 * The place name a site shows above a location: its neighbourhood when the
 * address names one, its town otherwise.
 */
export function addressPlaceName(address: PostalAddress | null): string {
  return address?.sublocality || address?.locality || ''
}

/**
 * The owner's own answers on the onboarding location step. The step is not
 * complete without a street, a city and a country, so every required part of
 * the address is present by the time this runs.
 */
export interface PostalAddressAnswers {
  streetAddress: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  /** ISO 3166-1 alpha-2, as answered on the location step. */
  country: string | null
}

export function postalAddressFromAnswers(answers: PostalAddressAnswers): PostalAddress | null {
  const addressLines = [answers.streetAddress, answers.addressLine2]
    .map(line => line?.trim() ?? '')
    .filter(Boolean)
  if (!addressLines.length) return null
  if (!answers.country?.trim()) {
    throw new TypeError('A postal address names its country; the location step does not complete without one')
  }
  const address: PostalAddress = { regionCode: answers.country.trim(), addressLines }
  if (answers.city?.trim()) address.locality = answers.city.trim()
  if (answers.region?.trim()) address.administrativeArea = answers.region.trim()
  if (answers.postalCode?.trim()) address.postalCode = answers.postalCode.trim()
  return address
}

/**
 * The address as schema.org writes it, for the JSON-LD a location page emits.
 * `google.type.PostalAddress` and schema.org `PostalAddress` name the same
 * parts, so the mapping is one to one and the whole address no longer has to be
 * flattened into `streetAddress`.
 */
export function schemaPostalAddress(address: PostalAddress | null): Record<string, string> | undefined {
  if (!address) return undefined
  const node: Record<string, string> = { '@type': 'PostalAddress', addressCountry: address.regionCode }
  const street = address.addressLines.filter(line => line.trim()).join(', ')
  if (street) node.streetAddress = street
  if (address.locality) node.addressLocality = address.locality
  if (address.administrativeArea) node.addressRegion = address.administrativeArea
  if (address.postalCode) node.postalCode = address.postalCode
  return node
}
