export const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
] as const

export type AttributionKey = typeof ATTRIBUTION_KEYS[number]
export type AttributionParams = Partial<Record<AttributionKey, string>>

export interface AttributionTouch {
  source: string
  medium: string
  campaign: string | null
  term: string | null
  content: string | null
  referrerHost: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  fbclid: string | null
  msclkid: string | null
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  })
}

function normalizeValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || hasControlCharacter(trimmed)) return null
  return Array.from(trimmed).slice(0, 255).join('')
}

export function readAttributionParams(searchParams: URLSearchParams): AttributionParams {
  const result: AttributionParams = {}
  for (const key of ATTRIBUTION_KEYS) {
    for (const candidate of searchParams.getAll(key)) {
      const normalized = normalizeValue(candidate)
      if (normalized) {
        result[key] = normalized
        break
      }
    }
  }
  return result
}

export function sanitizeAttributionParams(value: unknown): AttributionParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const result: AttributionParams = {}
  for (const key of ATTRIBUTION_KEYS) {
    const normalized = normalizeValue(record[key])
    if (normalized) result[key] = normalized
  }
  return result
}

export function normalizeReferrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

export function resolveAttributionTouch(
  params: AttributionParams,
  referrerHost: string | null,
  internalHosts: Iterable<string>,
): AttributionTouch | null {
  const clickIds = {
    gclid: params.gclid ?? null,
    gbraid: params.gbraid ?? null,
    wbraid: params.wbraid ?? null,
    fbclid: params.fbclid ?? null,
    msclkid: params.msclkid ?? null,
  }
  if (params.utm_source) {
    return {
      source: params.utm_source,
      medium: params.utm_medium ?? '(none)',
      campaign: params.utm_campaign ?? null,
      term: params.utm_term ?? null,
      content: params.utm_content ?? null,
      referrerHost: null,
      ...clickIds,
    }
  }

  let paidSource: string | null = null
  if (params.gclid || params.gbraid || params.wbraid) paidSource = 'Google'
  else if (params.fbclid) paidSource = 'Facebook'
  else if (params.msclkid) paidSource = 'Microsoft'
  if (paidSource) {
    return {
      source: paidSource,
      medium: 'paid',
      campaign: null,
      term: null,
      content: null,
      referrerHost: null,
      ...clickIds,
    }
  }

  const normalizedInternalHosts = new Set(
    Array.from(internalHosts, host => host.trim().toLowerCase()).filter(Boolean),
  )
  if (referrerHost && !normalizedInternalHosts.has(referrerHost.toLowerCase())) {
    return {
      source: referrerHost.toLowerCase(),
      medium: 'referral',
      campaign: null,
      term: null,
      content: null,
      referrerHost: referrerHost.toLowerCase(),
      gclid: null,
      gbraid: null,
      wbraid: null,
      fbclid: null,
      msclkid: null,
    }
  }
  return null
}
