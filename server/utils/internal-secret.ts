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
