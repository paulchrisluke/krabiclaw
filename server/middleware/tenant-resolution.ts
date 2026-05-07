// Tenant resolution middleware for KrabiClaw SaaS
// Determines if request is for platform or tenant site

import { defineEventHandler, getRequestURL, getHeader } from 'h3'
import { cloudflareEnv } from '../utils/api-response'

// Get platform domain from runtime config
function getPlatformDomain(): string {
  const domain = process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN
  // Remove protocol if present
  return domain.replace(/^https?:\/\//, '')
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const host = getHeader(event, 'host') || ''
  
  const isPlatform = isPlatformHost(host)
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
    return
  }
  
  // No tenant found - this is an unknown subdomain/custom domain
  event.context.tenantType = 'tenant-404'
  event.context.siteId = null
})

function isPlatformHost(host: string): boolean {
  const hostname = host?.split(':')[0] || ''
  const platformDomain = getPlatformDomain()
  const platformHosts = [
    'localhost',
    '127.0.0.1',
    platformDomain,
    `www.${platformDomain}`
  ]
  return platformHosts.includes(hostname)
}

function isPlatformRoute(pathname: string): boolean {
  const platformRoutes = [
    '/login',
    '/signup', 
    '/pricing',
    '/dashboard',
    '/api/auth',
    '/privacy-policy',
    '/terms-and-conditions',
    '/templates',
    '/features'
  ]
  
  return platformRoutes.some(route => pathname.startsWith(route))
}

async function resolveTenantSite(host: string, event: any): Promise<any> {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) return null

  // Local development support (e.g., demo.localhost:8788)
  if (host.includes('.localhost')) {
    const subdomain = host.split('.')[0]
    return await db.prepare(`
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status
      FROM sites s
      WHERE s.subdomain = ? AND s.status = 'active'
      LIMIT 1
    `).bind(subdomain).first()
  }
  
  // Try custom domains first (from site_domains table)
  const customDomainSite = await db.prepare(`
    SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain
    FROM sites s
    JOIN site_domains sd ON s.id = sd.site_id
    WHERE sd.domain = ? AND sd.type = 'custom' AND sd.status = 'active' 
      AND s.status = 'active' AND s.onboarding_status = 'active'
    LIMIT 1
  `).bind(host).first()
  
  if (customDomainSite) return customDomainSite
  
  // Try subdomains
  const platformDomain = getPlatformDomain()
  const subdomain = host.replace(`.${platformDomain}`, '').replace(':8788', '')
  if (subdomain && subdomain !== 'www' && subdomain !== host) {
    const subdomainSite = await db.prepare(`
      SELECT s.id, s.organization_id, s.theme_id, s.subdomain, s.onboarding_status, sd.domain
      FROM sites s
      JOIN site_domains sd ON s.id = sd.site_id
      WHERE sd.domain = ? AND sd.type = 'subdomain' AND sd.status = 'active' 
        AND s.status = 'active' AND s.onboarding_status = 'active'
      LIMIT 1
    `).bind(`${subdomain}.${platformDomain}`).first()
    
    if (subdomainSite) return subdomainSite
  }
  
  return null
}
