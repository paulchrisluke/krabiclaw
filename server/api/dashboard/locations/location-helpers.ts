export function parseLocationPayload<T>(value: T | null | undefined) {
  if (value == null) return null
  const location = value as Record<string, unknown>
  const parseJson = (field: string) => {
    const raw = location[field]
    if (typeof raw !== 'string' || !raw) return raw ?? null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  return {
    ...location,
    address: parseJson('address'),
    opening_hours: parseJson('opening_hours'),
    enabled_features: parseJson('enabled_features'),
    is_primary: Boolean(location.is_primary),
  }
}
