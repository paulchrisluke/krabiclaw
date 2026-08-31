export type LocaleMessages = Readonly<Record<string, string>>

export type CatalogValidationIssue =
  | { kind: 'shape' }
  | { kind: 'coverage'; missing: string[]; extra: string[] }
  | { kind: 'value'; key: string }
  | { kind: 'placeholder'; key: string; expected: string[]; actual: string[] }

export type CatalogValidationResult =
  | { ok: true; messages: Record<string, string> }
  | { ok: false; issue: CatalogValidationIssue }

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function flattenLocaleManifest(
  value: unknown,
  prefix = '',
  result: Record<string, string> = {},
): Record<string, string> {
  if (typeof value === 'string') {
    if (!prefix) throw new Error('Locale manifest root cannot be a string')
    result[prefix] = value
    return result
  }
  if (!isUnknownRecord(value)) {
    throw new Error(`Locale manifest value ${prefix || '<root>'} must be an object or string`)
  }
  for (const key of Object.keys(value).sort()) {
    flattenLocaleManifest(value[key], prefix ? `${prefix}.${key}` : key, result)
  }
  return result
}

export async function localeManifestHash(messages: LocaleMessages): Promise<string> {
  const payload = JSON.stringify(messages)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function localeMessagePlaceholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map(match => match[1])
    .filter(placeholder => placeholder !== undefined)
    .sort()
}

export function validateLocaleCatalog(
  source: LocaleMessages,
  messages: unknown,
  options: { complete: boolean },
): CatalogValidationResult {
  if (!isUnknownRecord(messages)) return { ok: false, issue: { kind: 'shape' } }

  const sourceKeys = Object.keys(source).sort()
  const targetKeys = Object.keys(messages).sort()
  const extra = targetKeys.filter(key => !Object.hasOwn(source, key))
  const missing = sourceKeys.filter((key) => {
    const value = messages[key]
    return !Object.hasOwn(messages, key) || typeof value !== 'string' || !value.trim()
  })
  if (extra.length || (options.complete && missing.length)) {
    return { ok: false, issue: { kind: 'coverage', missing, extra } }
  }

  const normalized: Record<string, string> = {}
  for (const key of targetKeys) {
    const value = messages[key]
    if (typeof value !== 'string') return { ok: false, issue: { kind: 'value', key } }
    if (!value.trim()) continue

    const expected = localeMessagePlaceholders(source[key] ?? '')
    const actual = localeMessagePlaceholders(value)
    if (expected.join('\0') !== actual.join('\0')) {
      return { ok: false, issue: { kind: 'placeholder', key, expected, actual } }
    }
    normalized[key] = value
  }
  return { ok: true, messages: normalized }
}
