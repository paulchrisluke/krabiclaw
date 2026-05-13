import { createHmac, timingSafeEqual } from 'node:crypto'

export function isPlatformOwner(email: string | null | undefined, env: Record<string, any>): boolean {
  if (!email) return false

  const platformOwnerEmails = env?.PLATFORM_OWNER_EMAILS ?? process.env.PLATFORM_OWNER_EMAILS ?? ''
  const emails = platformOwnerEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const normalizedEmail = email.toLowerCase()
  const hmacKey = String(env?.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? '')
  const normalizedEmailHash = createHmac('sha256', hmacKey).update(normalizedEmail).digest()
  let matched = false

  for (const candidate of emails) {
    const candidateHash = createHmac('sha256', hmacKey).update(candidate).digest()
    const isMatch = timingSafeEqual(normalizedEmailHash, candidateHash)
    matched = isMatch || matched
  }

  return matched
}

export function requirePlatformOwner(email: string | null | undefined, env: Record<string, any>): void {
  if (!isPlatformOwner(email, env)) {
    throw new Error('Platform owner access required')
  }
}
