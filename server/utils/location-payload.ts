import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import { parsePostalAddress, type PostalAddress } from '~/utils/postal-address'

type ParsedLocation<T> = Omit<T, 'address' | 'opening_hours' | 'special_hours' | 'feature_overrides'> & {
  address: PostalAddress | null
  opening_hours: OpeningHours
  special_hours: SpecialHours
  feature_overrides: unknown
}

export function parseLocationPayload<T>(value: T | null | undefined): ParsedLocation<T> | null {
  if (value == null) return null
  const location = value as Record<string, unknown>
  return {
    ...location,
    address: parsePostalAddress(location.address),
    opening_hours: parseOpeningHours(location.opening_hours ? JSON.parse(String(location.opening_hours)) : null),
    special_hours: parseSpecialHours(location.special_hours ? JSON.parse(String(location.special_hours)) : null),
    feature_overrides: location.feature_overrides ? JSON.parse(String(location.feature_overrides)) : null,
  } as ParsedLocation<T>
}
