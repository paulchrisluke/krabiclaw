/**
 * The one line a branch's address is read as on the public site.
 *
 * `business_locations.address` is either a plain string or the structured
 * object the onboarding form and the Google sync write. Either way the guest
 * reads one line: street, town, region, postal code — the parts that exist.
 */
export type LocationAddressInput = string | { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | null | undefined

export function formatLocationAddress(address: LocationAddressInput): string {
  if (!address) return ''
  if (typeof address === 'string') {
    if (!address.startsWith('{')) return address
    try {
      return formatLocationAddress(JSON.parse(address) as LocationAddressInput)
    } catch {
      return address
    }
  }
  return [address.addressLines?.[0], address.locality, address.administrativeArea, address.postalCode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ')
}
