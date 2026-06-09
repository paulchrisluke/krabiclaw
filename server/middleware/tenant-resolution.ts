// Tenant resolution middleware for KrabiClaw SaaS
// Determines if request is for platform or tenant site

import { defineEventHandler, getRequestURL, getHeader } from 'h3'
import { cloudflareEnv } from '../utils/api-response'
import { deriveSubdomain, getFreeSiteDomain, hostnameOf, isPlatformHost } from '../utils/tenant-hosts'

interface TenantResolutionEnv {
  DB?: D1Database
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

interface TenantSiteRow {
  id: string
  organization_id: string
  theme_id: string | null
  subdomain: string
  onboarding_status: string
  canonical_domain: string | null
  brand_name: string | null
  logo_url: string | null
  vertical: string | null
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const host = getHeader(event, 'host') || ''
  const env = cloudflareEnv(event)

  // Preview E2E: allow tests running against *.workers.dev preview Workers to
  // specify tenant via x-preview-tenant header. Only trusted for workers.dev
  // hosts — production custom domains never match this path.
  if (host.endsWith('.workers.dev')) {
    const previewSlug = getHeader(event, 'x-preview-tenant')
    if (previewSlug && /^[a-z0-9-]+$/.test(previewSlug)) {
      const freeSiteDomain = getFreeSiteDomain(env as TenantResolutionEnv)
      if (!freeSiteDomain) {
        console.error('[TenantResolution] Missing free site domain for workers.dev preview tenant resolution')
      } else {
        const site = await resolveTenantSite(`${previewSlug}.${freeSiteDomain}`, event)
        if (site) {
          event.context.siteId = site.id
          event.context.organizationId = site.organization_id
          event.context.themeId = site.theme_id
          event.context.onboardingStatus = site.onboarding_status
          event.context.tenantType = 'tenant'
          event.context.tenantHost = host.split(':')[0]
          event.context.canonicalDomain = site.canonical_domain || null
          event.context.site = { brand_name: site.brand_name || null, logo_url: site.logo_url || null, vertical: site.vertical || 'restaurant' }
          return
        }
      }
    }
  }

  const isPlatform = isPlatformHost(host, env)
  const isPlatformPath = isPlatformRoute(url.pathname)

  console.log(`[TenantResolution] Host: ${host}, Path: ${url.pathname}, isPlatform: ${isPlatform}, isPlatformPath: ${isPlatformPath}`)

  // Platform routes (KrabiClaw SaaS)
  if (isPlatform || isPlatformPath) {
    event.context.tenantType = 'platform'
    event.context.siteId = null
    return
  }

  // Tenant site resolution
  const site = await resolveTenantSite(host, event)
  
  // If site found, handle based on onboarding status
  if (site) {
    event.context.siteId = site.id
    event.context.organizationId = site.organization_id
    event.context.themeId = site.theme_id
    event.context.onboardingStatus = site.onboarding_status
    event.context.tenantType = 'tenant'
    event.context.tenantHost = host.split(':')[0]
    event.context.canonicalDomain = site.canonical_domain || null
    event.context.site = { brand_name: site.brand_name || null, logo_url: site.logo_url || null, vertical: site.vertical || 'restaurant' }
    return
  }
  
  // No tenant found - this is an unknown subdomain/custom domain
  event.context.tenantType = 'tenant-404'
  event.context.siteId = null
})

function isPlatformRoute(pathname: string): boolean {
  const exactOrTrailingSlashRoutes = ['/privacy', '/terms']
  const prefixRoutes = [
    '/login',
    '/signup',
    '/pricing',
    '/dashboard',
    '/api/auth',
    '/api/dashboard',
    '/api/sites',
    '/api/admin',
    '/templates',
    '/features'
  ]

  const exactMatch = exactOrTrailingSlashRoutes.some(route => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped}/?$`).test(pathname)
  })

  if (exactMatch) return true

  return prefixRoutes.some(route => pathname.startsWith(route))
}

async function resolveTenantSite(host: string, event: Parameters<typeof cloudflareEnv>[0]): Promise<TenantSiteRow | null> {
  const env = cloudflareEnv(event) as TenantResolutionEnv
  const db = env.DB
  const hostname = hostnameOf(host)

  if (!db || !hostname) return null

  // Local development support (e.g., demo.localhost)
  if (hostname.includes('.localhost')) {
    const subdomain = hostname.split('.')[0]
    return await db.prepare(`
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status,
             s.subdomain || '.localhost' AS canonical_domain,
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical
      FROM sites s
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `).bind(subdomain).first() as TenantSiteRow | null
  }

  // Try custom domains first (from site_domains table)
  const customDomainSite = await db.prepare(`
    SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
           COALESCE(canonical.domain, sd.domain) AS canonical_domain,
           s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical
    FROM sites s
    JOIN site_domains sd ON s.id = sd.site_id
    LEFT JOIN site_domains canonical
      ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
    LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
    WHERE sd.domain = ? AND sd.type = 'custom' AND sd.status = 'active'
      AND s.status = 'active' AND s.onboarding_status = 'active'
    LIMIT 1
  `).bind(hostname).first() as TenantSiteRow | null

  if (customDomainSite) return customDomainSite

  // Try subdomains
  const platformDomain = getFreeSiteDomain(env)
  const isPlatformSubdomainHost =
    hostname !== 'localhost' &&
    hostname !== platformDomain &&
    hostname.endsWith(`.${platformDomain}`)

  if (isPlatformSubdomainHost) {
    const subdomain = deriveSubdomain(hostname, platformDomain)
    if (!subdomain) return null

    const subdomainSite = await db.prepare(`
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain,
             COALESCE(canonical.domain, sd.domain) AS canonical_domain,
             s.brand_name, COALESCE(ma.public_url, s.logo_url) AS logo_url, s.vertical
      FROM sites s
      JOIN site_domains sd ON s.id = sd.site_id
      LEFT JOIN site_domains canonical
        ON canonical.site_id = s.id AND canonical.role = 'canonical' AND canonical.status = 'active'
      LEFT JOIN media_assets ma ON s.logo_asset_id = ma.id AND ma.status = 'active'
      WHERE sd.domain = ? AND sd.type = 'subdomain' AND sd.status = 'active'
        AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `).bind(`${subdomain}.${platformDomain}`).first() as TenantSiteRow | null

    if (subdomainSite) return subdomainSite
  }

  return null
}
