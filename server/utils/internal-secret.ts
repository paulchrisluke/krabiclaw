import { getHeader, type H3Event } from 'h3'
import type { CloudflareEnv } from '~/server/utils/auth'

// Shared constant-time secret comparison for internal, secret-gated routes
// (server/api/internal/search/*). Extracted so multiple internal routes can reuse the
// same check instead of duplicating the timing-safe comparison logic.
export async function secretsMatch(expectedSecret: string, providedSecret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (_expectedDigest: BufferSource, _providedDigest: BufferSource) => boolean
  }
  const [expectedDigest, providedDigest] = await Promise.all([
    subtle.digest('SHA-256', encoder.encode(expectedSecret)),
    subtle.digest('SHA-256', encoder.encode(providedSecret)),
  ])

  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(expectedDigest, providedDigest)
  }

  const left = new Uint8Array(expectedDigest)
  const right = new Uint8Array(providedDigest)
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

export type InternalRequestValidation =
  | { ok: true }
  | { ok: false, status: 401 | 500, error: string }

// Shared auth flow for every server/api/internal/search/* route: validates the shared
// PLATFORM_SEARCH_REINDEX_SECRET the same way (misconfiguration -> 500, mismatch -> 401)
// so each route stays a thin handler instead of duplicating this check.
export async function validateInternalRequest(event: H3Event, env: CloudflareEnv): Promise<InternalRequestValidation> {
  const expectedSecret = typeof env.PLATFORM_SEARCH_REINDEX_SECRET === 'string'
    ? env.PLATFORM_SEARCH_REINDEX_SECRET.trim()
    : ''
  if (!expectedSecret) {
    return { ok: false, status: 500, error: 'PLATFORM_SEARCH_REINDEX_SECRET is not configured' }
  }

  const providedSecret = getHeader(event, 'x-krabiclaw-search-secret')
    ?? getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''

  if (!(await secretsMatch(expectedSecret, providedSecret))) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}
