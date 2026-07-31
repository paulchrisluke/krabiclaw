type ParsedLocation<T> = Omit<T, 'address' | 'opening_hours' | 'feature_overrides' | 'is_primary'> & {
  address: { addressLines?: string[] } | null
  opening_hours: { weekdayDescriptions?: string[] } | null
  feature_overrides: unknown
  is_primary: boolean
}

export function parseLocationPayload<T>(value: T | null | undefined): ParsedLocation<T> | null {
  if (value == null) return null
  const location = value as Record<string, unknown>
  const parseJson = (field: string): unknown => {
    const raw = location[field]
    if (typeof raw !== 'string' || !raw) return raw ?? null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const address = parseJson('address')
  const openingHours = parseJson('opening_hours')
  return {
    ...location,
    address: isRecord(address) && (address.addressLines === undefined
      || (Array.isArray(address.addressLines) && address.addressLines.every(line => typeof line === 'string')))
      ? address as { addressLines?: string[] }
      : null,
    opening_hours: isRecord(openingHours) && (openingHours.weekdayDescriptions === undefined
      || (Array.isArray(openingHours.weekdayDescriptions)
        && openingHours.weekdayDescriptions.every(description => typeof description === 'string')))
      ? openingHours as { weekdayDescriptions?: string[] }
      : null,
    feature_overrides: parseJson('feature_overrides'),
    is_primary: Boolean(location.is_primary),
  } as ParsedLocation<T>
}
