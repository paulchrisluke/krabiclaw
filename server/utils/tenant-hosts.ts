// Pure host-matching helpers for tenant/platform resolution.
// Extracted so the platform-vs-tenant decision can be unit tested
// independently of the H3 event/D1 plumbing in tenant-resolution.ts.

export interface TenantHostEnv {
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

const PAGES_DEV_HOST = 'kikuzuki-thailand-marketing.pages.dev'

// Strip protocol, trailing slash, and port so config values (which may be
// full URLs like "https://krabiclaw.com" or "http://localhost:3000") compare
// cleanly against a request's hostname (which never carries protocol and has
// already had its port stripped by the caller).
export function normalizeHost(value?: string | null): string {
  return String(value || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split(':')[0] || ''
}

export function hostnameOf(host: string): string {
  return host?.split(':')[0] || ''
}

// "localhost" / "krabiclaw.com" are platform routes regardless of how
// NUXT_PUBLIC_FREE_SITE_DOMAIN is configured (see CLAUDE.md "Multi-Tenancy").
// This mirrors the hardcoded 'krabiclaw.com' fallback in
// server/utils/domains.ts platformDomainCandidates.
export function getPlatformHosts(env: TenantHostEnv): string[] {
  return Array.from(new Set([
    'localhost',
    '127.0.0.1',
    'krabiclaw.com',
    'www.krabiclaw.com',
    normalizeHost(env.NUXT_PUBLIC_FREE_SITE_DOMAIN),
    normalizeHost(env.NUXT_PUBLIC_PLATFORM_DOMAIN),
  ].filter((value): value is string => Boolean(value))))
}

export function isPlatformHost(host: string, env: TenantHostEnv): boolean {
  const hostname = hostnameOf(host)
  if (hostname === PAGES_DEV_HOST || hostname.endsWith(`.${PAGES_DEV_HOST}`)) {
    return true
  }
  return getPlatformHosts(env).includes(hostname)
}

// The domain that free-tier subdomains (e.g. "demo.krabiclaw.com") are minted
// under. Falls back to 'krabiclaw.com' when unconfigured, matching
// platformDomainCandidates in server/utils/domains.ts.
export function getFreeSiteDomain(env: TenantHostEnv): string {
  return normalizeHost(env.NUXT_PUBLIC_FREE_SITE_DOMAIN) || 'krabiclaw.com'
}

// Derives the subdomain label to look up in site_domains for a given
// hostname, e.g. "demo.krabiclaw.com" -> "demo". Returns '' when the
// hostname isn't a subdomain of the configured free-site domain and isn't
// a simple two-label host either.
export function deriveSubdomain(hostname: string, freeSiteDomain: string): string {
  if (!hostname) return ''

  const subdomain = freeSiteDomain && hostname.endsWith(`.${freeSiteDomain}`)
    ? hostname.replace(`.${freeSiteDomain}`, '')
    : hostname.split('.')[0]

  if (!subdomain || subdomain === 'www' || subdomain === hostname) return ''
  return subdomain
}
