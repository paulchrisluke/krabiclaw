import { getPhoneCountry } from '~/utils/phone'

/**
 * A street address as the owner answered it, one field per answer. These are
 * the source; the single-line form a location stores is derived from them by
 * composePostalAddress() and is never stored alongside them.
 *
 * Keeping the parts is not tidiness. The draft used to persist only the
 * composed line and read it straight back into the street field on resume, so
 * an owner who left after the location step returned to find their street
 * address reading "United States".
 */
export interface PostalAddressParts {
  streetAddress: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
  /** ISO 3166-1 alpha-2, as answered on the location step. */
  country: string
  /**
   * True when the street line came from Google, which returns the whole
   * formatted address on one line, already ending in a country spelled its own
   * way ("…, NY 10002, USA"). Our name for that country ("United States") does
   * not appear in the line, so a containment test cannot detect it and the
   * country is simply not appended.
   */
  streetIsFormatted: boolean
}

/**
 * The address as a location stores it: one line per block, the way it would be
 * written on an envelope. A segment the street line already contains is not
 * repeated.
 */
export function composePostalAddress(parts: PostalAddressParts): string {
  const street = parts.streetAddress.trim()
  // Word boundaries, not substrings: the region "CA" occurs inside "123 Acacia
  // Ave", and treating that as "already written" dropped the state from the
  // composed address.
  const streetWords = new Set(street.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  const alreadyInStreet = (segment: string) => {
    const words = segment.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    return words.length > 0 && words.every(word => streetWords.has(word))
  }

  const locality = [parts.city, parts.region, parts.postalCode]
    .map(part => part.trim())
    .filter(part => part && !alreadyInStreet(part))
    .join(', ')

  const countryName = parts.streetIsFormatted ? '' : getPhoneCountry(parts.country)?.name ?? ''
  const country = countryName && !alreadyInStreet(countryName) ? countryName : ''

  return [street, parts.addressLine2, locality, country]
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n')
}
