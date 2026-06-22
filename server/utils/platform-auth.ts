import { createHmac, timingSafeEqual } from 'node:crypto'

function requireAuthSecret(env: ApiRecord): string {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '').trim()
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return secret
}

function parseRoleList(role: string | null | undefined): string[] {
  return String(role ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

export function hasBetterAuthAdminRole(role: string | null | undefined): boolean {
  return parseRoleList(role).includes('admin')
}

export function isPlatformOwnerEmail(email: string | null | undefined, env: ApiRecord): boolean {
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

export function isPlatformAdmin(
  user: { role?: string | null; email?: string | null | undefined } | null | undefined,
  env: ApiRecord,
): boolean {
  if (!user) return false
  return hasBetterAuthAdminRole(user.role) || isPlatformOwnerEmail(user.email, env)
}

export function requirePlatformAdmin(
  user: { role?: string | null; email?: string | null | undefined } | null | undefined,
  env: ApiRecord,
): void {
  if (!isPlatformAdmin(user, env)) {
    throw new Error('Platform admin access required')
  }
}

// Backward-compatible aliases while older code is migrated.
export const isPlatformOwner = isPlatformOwnerEmail
export function requirePlatformOwner(email: string | null | undefined, env: ApiRecord): void {
  if (!isPlatformOwnerEmail(email, env)) {
    throw new Error('Platform owner access required')
  }
}

export function anonymizeId(id: string | null | undefined, env: ApiRecord): string {
  const key = requireAuthSecret(env)
  const normalized = id == null ? '__NULLISH__' : String(id)
  return createHmac('sha256', key).update(normalized).digest('hex')
}
