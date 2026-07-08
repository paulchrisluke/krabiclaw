interface ReplyDomainEnv {
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export function getReplyDomain(env: ReplyDomainEnv): string {
  const rawEnvValue = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim() || ''
  const rawPlatformDomain = rawEnvValue || 'krabiclaw.com'
  let platformDomain = rawPlatformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')

  try {
    platformDomain = new URL(/^https?:\/\//i.test(rawPlatformDomain) ? rawPlatformDomain : `https://${rawPlatformDomain}`).hostname
  } catch {
    platformDomain = platformDomain.replace(/:\d+$/, '')
  }

  // Ensure platformDomain is never empty
  if (!platformDomain) {
    platformDomain = 'krabiclaw.com'
  }

  if (platformDomain === 'localhost' || platformDomain === '127.0.0.1' || platformDomain === '[::1]') {
    platformDomain = 'krabiclaw.local'
  }

  return `reply.${platformDomain}`
}
