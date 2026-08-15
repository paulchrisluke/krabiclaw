// Pure host-matching helpers for tenant/platform resolution.
// Extracted so the platform-vs-tenant decision can be unit tested
// independently of the H3 event/D1 plumbing in tenant-resolution.ts.

export interface TenantHostEnv {
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

const PAGES_DEV_HOST = 'krabiclaw.pages.dev'

// CI runs Playwright against the one preview Worker's canonical workers.dev host.
const WORKERS_DEV_PREVIEW_HOST_PATTERN = /^krabiclaw-preview\.[a-z0-9-]+\.workers\.dev$/

// Strip protocol, path, and port so config values (which may be
// full URLs like "https://krabiclaw.com" or "http://localhost:3000") compare
// cleanly against a request's hostname (which never carries protocol and has
// already had its port stripped by the caller).
export function normalizeHost(value?: string | null): string {
  return String(value || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .split(':')[0] || ''
}

export function hostnameOf(host: string): string {
  return host?.split(':')[0] || ''
}

export function getPlatformHosts(env: TenantHostEnv): string[] {
  return Array.from(new Set([
    'localhost',
    '127.0.0.1',
    normalizeHost(env.NUXT_PUBLIC_FREE_SITE_DOMAIN),
    normalizeHost(env.NUXT_PUBLIC_PLATFORM_DOMAIN),
  ].filter((value): value is string => Boolean(value))))
}

export function getPlatformHtmlCacheHosts(
  env: TenantHostEnv,
  extraHosts: (string | null | undefined)[] = [],
): string[] {
  return Array.from(new Set([
    ...extraHosts.map(normalizeHost),
    ...getPlatformHosts(env),
  ].filter((value): value is string => Boolean(value))))
}

export function isPlatformHost(host: string, env: TenantHostEnv): boolean {
  const hostname = hostnameOf(host)
  if (hostname === PAGES_DEV_HOST || hostname.endsWith(`.${PAGES_DEV_HOST}`)) {
    return true
  }
  if (WORKERS_DEV_PREVIEW_HOST_PATTERN.test(hostname)) {
    return true
  }
  return getPlatformHosts(env).includes(hostname)
}

// Returns true for shared hosts where x-preview-tenant carries tenant identity
// because the request cannot use a tenant hostname. This includes local
// workerd, the named local tunnel, preview, and staging.
export function isPreviewContext(host: string): boolean {
  const hostname = hostnameOf(host).toLowerCase().replace(/\.$/, '')
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (hostname === 'local.krabiclaw.com') return true
  if (hostname === 'preview.krabiclaw.com' || hostname === 'staging.krabiclaw.com') return true
  return WORKERS_DEV_PREVIEW_HOST_PATTERN.test(hostname)
}

export function getFreeSiteDomain(env: TenantHostEnv): string {
  const domain = normalizeHost(env.NUXT_PUBLIC_FREE_SITE_DOMAIN)
  if (!domain) throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN is required')
  return domain
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
