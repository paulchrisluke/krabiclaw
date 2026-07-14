import { TENANT_TYPES, type TenantType } from '../../utils/tenant-routing.ts'

export const PLATFORM_SITEMAP_ROUTES = [
  '/',
  '/about',
  '/blog',
  '/docs',
  '/features',
  '/help',
  '/plugin',
  '/pricing',
  '/privacy',
  '/templates',
  '/templates/blawby',
  '/templates/saya',
  '/terms',
] as const

export const PRIVATE_ROUTE_PREFIXES = [
  '/admin',
  '/api',
  '/auth',
  '/dashboard',
  '/dev',
  '/oauth',
  '/preview',
  '/transfer',
] as const

export const PRIVATE_EXACT_ROUTES = new Set([
  '/accept-invitation',
  '/contact/confirmed',
  '/experiences/confirmed',
  '/forgot-password',
  '/login',
  '/reservations/cancel',
  '/reservations/confirmed',
  '/reset-password',
  '/signup',
  '/tenant-404',
  '/tenant-setup-incomplete',
  '/tenant-setup-pending',
])

export const TENANT_ONLY_EXACT_ROUTES = new Set([
  '/contact',
  '/experiences',
  '/locations',
  '/menu',
  '/order',
  '/photos',
  '/posts',
  '/qa',
  '/reservations',
  '/reviews',
])

export const TENANT_ONLY_ROUTE_PREFIXES = [
  '/contact/',
  '/experiences/',
  '/locations/',
  '/menu/',
  '/order/',
  '/photos/',
  '/posts/',
  '/qa/',
  '/reservations/',
  '/reviews/',
] as const

export interface RuntimeSeoSiteConfig {
  url: string
  indexable: boolean
  name?: string
}

export function isPrivateSeoPath(pathname: string): boolean {
  if (PRIVATE_EXACT_ROUTES.has(pathname)) return true
  return PRIVATE_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isTenantOnlySeoPath(pathname: string): boolean {
  return TENANT_ONLY_EXACT_ROUTES.has(pathname)
    || TENANT_ONLY_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export function isNonIndexableHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'preview.krabiclaw.com'
    || host === 'staging.krabiclaw.com'
    || host === 'local.krabiclaw.com'
    || host.endsWith('.pages.dev')
    || host.endsWith('.workers.dev')
    || host.endsWith('.trycloudflare.com')
}

export function resolveRuntimeSeoSiteConfig(input: {
  tenantType?: TenantType | null
  origin: string
  hostname: string
  tenantName?: string | null
}): RuntimeSeoSiteConfig {
  const indexable = !isNonIndexableHost(input.hostname)

  if (input.tenantType === TENANT_TYPES.TENANT) {
    const name = String(input.tenantName || '').trim()
    return {
      url: input.origin,
      indexable,
      ...(name ? { name } : {}),
    }
  }

  if (input.tenantType === TENANT_TYPES.PLATFORM) {
    return {
      name: 'KrabiClaw',
      url: indexable ? 'https://krabiclaw.com' : input.origin,
      indexable,
    }
  }

  return {
    url: input.origin,
    indexable: false,
  }
}
