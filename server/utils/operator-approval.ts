const OPERATOR_APPROVAL_VERSION = 1 as const

export type OperatorApprovalErrorCode =
  | 'approval_token_invalid'
  | 'approval_expired'
  | 'approval_token_mismatch'
  | 'approval_state_mismatch'
  | 'configuration_error'

export class OperatorApprovalError extends Error {
  readonly code: OperatorApprovalErrorCode
  readonly statusCode: number

  constructor(code: OperatorApprovalErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'OperatorApprovalError'
    this.code = code
    this.statusCode = statusCode
  }
}

export interface OperatorApprovalClaims<TRequest = unknown> {
  version: number
  purpose: string
  actor: string
  request: TRequest
  expectedStateSha256: string
  expiresAt: string
}

export interface CreateOperatorApprovalTokenInput<TRequest = unknown> {
  purpose: string
  actor: string
  request: TRequest
  expectedStateSha256: string
  expiresAt: string
}

export interface VerifyOperatorApprovalTokenInput<TRequest = unknown> {
  purpose: string
  actor: string
  request: TRequest
  expectedStateSha256: string
  now?: Date
}

function fail(code: OperatorApprovalErrorCode, statusCode: number, message: string): never {
  throw new OperatorApprovalError(code, statusCode, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value) as string
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('approval_token_invalid', 409, 'Approval token is invalid.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    fail('approval_token_invalid', 409, 'Approval token is invalid.')
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function importApprovalKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (!secret) {
    fail('configuration_error', 500, 'BETTER_AUTH_SECRET is required for operator approvals.')
  }
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  )
}

export async function createOperatorApprovalToken<TRequest>(
  secret: string,
  input: CreateOperatorApprovalTokenInput<TRequest>,
): Promise<string> {
  const claims: OperatorApprovalClaims<TRequest> = {
    version: OPERATOR_APPROVAL_VERSION,
    purpose: input.purpose,
    actor: input.actor,
    request: input.request,
    expectedStateSha256: input.expectedStateSha256,
    expiresAt: input.expiresAt,
  }
  const payload = bytesToBase64Url(new TextEncoder().encode(canonicalJson(claims)))
  const key = await importApprovalKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifyOperatorApprovalToken<TRequest>(
  secret: string,
  token: string,
  expected: VerifyOperatorApprovalTokenInput<TRequest>,
): Promise<OperatorApprovalClaims<TRequest>> {
  if (typeof token !== 'string') fail('approval_token_invalid', 409, 'Approval token is invalid.')
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) fail('approval_token_invalid', 409, 'Approval token is invalid.')
  const payloadBytes = base64UrlToBytes(parts[0])
  const signatureBytes = base64UrlToBytes(parts[1])
  let claims: unknown
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    fail('approval_token_invalid', 409, 'Approval token is invalid.')
  }
  const key = await importApprovalKey(secret, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes as unknown as BufferSource, new TextEncoder().encode(parts[0]))
  if (!valid || !isRecord(claims)) fail('approval_token_invalid', 409, 'Approval token is invalid.')

  const verifiedClaims = claims as unknown as OperatorApprovalClaims<TRequest>
  if (verifiedClaims.version !== OPERATOR_APPROVAL_VERSION) {
    fail('approval_token_invalid', 409, 'Approval token version is invalid.')
  }
  const expiresAt = Date.parse(verifiedClaims.expiresAt)
  const now = expected.now ?? new Date()
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    fail('approval_expired', 409, 'Approval token has expired.')
  }
  if (
    verifiedClaims.purpose !== expected.purpose
    || verifiedClaims.actor !== expected.actor
    || canonicalJson(verifiedClaims.request) !== canonicalJson(expected.request)
  ) {
    fail('approval_token_mismatch', 409, 'Approval token does not match this operator request.')
  }
  if (verifiedClaims.expectedStateSha256 !== expected.expectedStateSha256) {
    fail('approval_state_mismatch', 409, 'Approval state digest does not match the reviewed plan.')
  }
  return verifiedClaims
}
