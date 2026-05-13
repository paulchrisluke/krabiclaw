export function isPlatformOwner(email: string | null | undefined, env: Record<string, any>): boolean {
  if (!email) return false

  const platformOwnerEmails = env?.PLATFORM_OWNER_EMAILS ?? process.env.PLATFORM_OWNER_EMAILS ?? ''
  const emails = platformOwnerEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const normalizedEmail = email.toLowerCase()

  return emails.includes(normalizedEmail)
}

export function requirePlatformOwner(email: string | null | undefined, env: Record<string, any>): void {
  if (!isPlatformOwner(email, env)) {
    throw new Error('Platform owner access required')
  }
}
