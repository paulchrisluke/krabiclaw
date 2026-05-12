// Platform owner authentication utilities
// Platform owners: configured via PLATFORM_OWNER_EMAILS environment variable

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')

  if (aBuf.length !== bBuf.length) return false

  try {
    return require('crypto').timingSafeEqual(aBuf, bBuf)
  } catch {
    // Fallback for environments without timingSafeEqual
    let result = 0
    const maxLen = Math.max(aBuf.length, bBuf.length)
    for (let i = 0; i < maxLen; i++) {
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
