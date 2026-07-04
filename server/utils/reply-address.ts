export type ReplySubmissionType = 'contact' | 'reservation' | 'experience_booking'

const CURRENT_TOKEN_BYTES = 12
const LEGACY_TOKEN_BYTES = 16

const TYPE_TO_CODE: Record<ReplySubmissionType, 'c' | 'r' | 'e'> = {
  contact: 'c',
  reservation: 'r',
  experience_booking: 'e',
}

const CODE_TO_TYPE: Record<'c' | 'r' | 'e', ReplySubmissionType> = {
  c: 'contact',
  r: 'reservation',
  e: 'experience_booking',
}

function compactUuid(value: string): string | null {
  const compact = value.toLowerCase().replace(/-/g, '')
  return /^[0-9a-f]{32}$/.test(compact) ? compact : null
}

function expandUuid(value: string): string {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

async function hmacHex(secret: string, message: string, bytes: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, bytes * 2)
}

function timingSafeEqual(leftValue: string, rightValue: string): boolean {
  const textEncoder = new TextEncoder()
  const left = textEncoder.encode(leftValue)
  const right = textEncoder.encode(rightValue)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

export async function buildReplyToken(secret: string, submissionType: ReplySubmissionType, submissionId: string): Promise<string> {
  return hmacHex(secret, `${submissionType}:${submissionId.toLowerCase()}`, CURRENT_TOKEN_BYTES)
}

export async function verifyReplyTokenValue(secret: string, submissionType: string, submissionId: string, token: string): Promise<boolean> {
  const message = `${submissionType}:${submissionId.toLowerCase()}`
  const expectedCurrent = await hmacHex(secret, message, CURRENT_TOKEN_BYTES)
  if (timingSafeEqual(expectedCurrent, token)) return true

  // Backward compatibility for any previously-issued reply addresses.
  const expectedLegacy = await hmacHex(secret, message, LEGACY_TOKEN_BYTES)
  return timingSafeEqual(expectedLegacy, token)
}

// Compact format keeps the local part under the 64-character SMTP limit:
// r<type><uuid-without-hyphens><24-char-hmac>@reply.<domain>
export function buildReplyLocalPart(submissionType: ReplySubmissionType, submissionId: string, token: string): string | null {
  const typeCode = TYPE_TO_CODE[submissionType]
  const compactId = compactUuid(submissionId)
  if (!compactId) return null
  return `r${typeCode}${compactId}${token}`
}

export function parseReplyLocalPart(local: string): { submissionType: ReplySubmissionType; submissionId: string; token: string } | null {
  const compactMatch = /^r([cre])([0-9a-f]{32})([0-9a-f]{24})$/i.exec(local)
  if (compactMatch) {
    const code = compactMatch[1]!.toLowerCase() as 'c' | 'r' | 'e'
    return {
      submissionType: CODE_TO_TYPE[code],
      submissionId: expandUuid(compactMatch[2]!.toLowerCase()),
      token: compactMatch[3]!.toLowerCase(),
    }
  }

  const legacyMatch = /^reply\+([a-z_]+)-(.+)-([0-9a-f]{32})$/i.exec(local)
  if (!legacyMatch) return null

  const submissionType = legacyMatch[1]!.toLowerCase()
  if (submissionType !== 'contact' && submissionType !== 'reservation' && submissionType !== 'experience_booking') {
    return null
  }

  return {
    submissionType,
    submissionId: legacyMatch[2]!,
    token: legacyMatch[3]!.toLowerCase(),
  }
}
