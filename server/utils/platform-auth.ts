// Platform owner authentication utilities
// Platform owners: configured via PLATFORM_OWNER_EMAILS environment variable

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  try {
    return require('crypto').timingSafeEqual(aBuf, bBuf)
  } catch {
    // Fallback for environments without timingSafeEqual
    let result = 0
    for (let i = 0; i < aBuf.length; i++) {
      result |= (aBuf[i] || 0) ^ (bBuf[i] || 0)
    }
    return result === 0
  }
}

export function isPlatformOwner(email: string | null | undefined): boolean {
  if (!email) return false
  
  const platformOwnerEmails = process.env.PLATFORM_OWNER_EMAILS || ''
  const emails = platformOwnerEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const normalizedEmail = email.toLowerCase()
  
  // Use timing-safe comparison for each candidate
  for (const candidate of emails) {
    if (timingSafeEqual(candidate, normalizedEmail)) {
      return true
    }
  }
  
  return false
}

export function requirePlatformOwner(email: string | null | undefined): void {
  if (!isPlatformOwner(email)) {
    throw new Error('Platform owner access required')
  }
}
