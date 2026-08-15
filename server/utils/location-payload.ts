type ParsedLocation<T> = Omit<T, 'address' | 'opening_hours' | 'feature_overrides' | 'is_primary'> & {
  address: { addressLines?: string[] } | null
  opening_hours: { weekdayDescriptions?: string[] } | null
  feature_overrides: unknown
  is_primary: boolean
}

export function parseLocationPayload<T>(value: T | null | undefined): ParsedLocation<T> | null {
  if (value == null) return null
  const location = value as Record<string, unknown>
  const address = location.address ? JSON.parse(String(location.address)) : {}
  const openingHours = location.opening_hours ? JSON.parse(String(location.opening_hours)) : {}
  return {
    ...location,
    address: isRecord(address) && (address.addressLines === undefined
      || (Array.isArray(address.addressLines) && address.addressLines.every(line => typeof line === 'string')))
      ? address as { addressLines?: string[] }
      : address,
    opening_hours: isRecord(openingHours) && (openingHours.weekdayDescriptions === undefined
      || (Array.isArray(openingHours.weekdayDescriptions)
        && openingHours.weekdayDescriptions.every(description => typeof description === 'string')))
      ? openingHours as { weekdayDescriptions?: string[] }
      : openingHours,
    feature_overrides: location.feature_overrides ? JSON.parse(String(location.feature_overrides)) : null,
    is_primary: Boolean(location.is_primary),
  } as ParsedLocation<T>
}
