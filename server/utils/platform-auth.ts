import { createHmac, timingSafeEqual } from 'node:crypto'

function requireAuthSecret(env: ApiRecord): string {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '').trim()
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return secret
}

export function isPlatformOwner(email: string | null | undefined, env: ApiRecord): boolean {
  if (!email) return false

  const platformOwnerEmails = String(env?.PLATFORM_OWNER_EMAILS ?? '')
  const emails = platformOwnerEmails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) return false

  const hmacKey = requireAuthSecret(env)
  const normalizedEmail = email.toLowerCase()
  const normalizedEmailHash = createHmac('sha256', hmacKey).update(normalizedEmail).digest()
  let matched = false

  for (const candidate of emails) {
    const candidateHash = createHmac('sha256', hmacKey).update(candidate).digest()
    const isMatch = timingSafeEqual(normalizedEmailHash, candidateHash)
    matched = isMatch || matched
  }

  return matched
}

export function requirePlatformOwner(email: string | null | undefined, env: ApiRecord): void {
  if (!isPlatformOwner(email, env)) {
    throw new Error('Platform owner access required')
  }
}

export function anonymizeId(id: string | null | undefined, env: ApiRecord): string {
  const key = requireAuthSecret(env)
  const normalized = id == null ? '__NULLISH__' : String(id)
  return createHmac('sha256', key).update(normalized).digest('hex')
}
