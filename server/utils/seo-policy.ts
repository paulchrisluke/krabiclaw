import { getRequestURL, type H3Event } from 'h3'
import { TENANT_TYPES } from '../../utils/tenant-routing'

export interface SeoSitemapEntry {
  loc: string
  lastmod?: string | null
}

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
  '/billing',
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

export function isPlatformSeoRequest(event: H3Event): boolean {
  return event.context.tenantType === TENANT_TYPES.PLATFORM
}

export function isTenantSeoRequest(event: H3Event): boolean {
  return event.context.tenantType === TENANT_TYPES.TENANT
}

export function getSeoOrigin(event: H3Event): string {
  if (isTenantSeoRequest(event)) {
    const canonicalDomain = String(event.context.canonicalDomain || '').trim()
    if (canonicalDomain) return `https://${canonicalDomain}`
  }

  return getRequestURL(event).origin
}

export function absoluteSeoUrl(event: H3Event, path: string): string {
  return new URL(path, `${getSeoOrigin(event)}/`).toString()
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
