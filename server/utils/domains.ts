// Domain validation and management utilities for KrabiClaw

export interface DomainEnv {
  CLOUDFLARE_API_TOKEN?: string
}

// Get platform domain from environment
function getPlatformDomain(): string {
  const domain = process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN
  if (!domain) {
    throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN environment variable is required')
  }
  return domain
}

export interface DomainRecord {
  id: string
  organization_id: string
  site_id: string
  domain: string
  type: 'subdomain' | 'custom'
  status: 'pending' | 'verifying' | 'active' | 'failed' | 'disabled'
  verification_token?: string
  verification_method?: string
  last_checked_at?: string
  verified_at?: string
  error_message?: string
  created_at: string
  updated_at: string
}

// Reserved domains that cannot be used
const reservedDomains = [
  'www', 'app', 'api', 'admin', 'dashboard', 'login', 'signup',
  'pricing', 'billing', 'support', 'help', 'docs', 'blog', 'posts',
  'qa', 'legal', 'terms', 'privacy', 'static', 'assets', 'cdn',
  'mail', 'status', 'staging', 'dev', 'test', 'beta', 'demo',
  'ns1', 'ns2', 'mx', 'txt', 'cname', 'a', 'aaaa'
]

// Platform domains that cannot be used as custom domains
function getPlatformDomains(): string[] {
  const platformDomain = getPlatformDomain()
  return [
    platformDomain,
    'krabiclaw.com'
  ].filter(Boolean) // Remove any falsy values
}

// Normalize and validate domain
export function normalizeDomain(domain: string): string {
  if (!domain) return ''
  
  // Remove protocol, path, query, fragment
  let normalized = domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    ?.split('?')[0]
    ?.split('#')[0]
    ?.trim()
    ?.toLowerCase() || ''
  
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '')
  
  return normalized
}

// Validate domain format and restrictions
export function validateCustomDomain(domain: string): { valid: boolean; reason?: string } {
  const normalized = normalizeDomain(domain)
  
  if (!normalized) {
    return { valid: false, reason: 'Domain is required' }
  }
  
  // Check length
  if (normalized.length < 3 || normalized.length > 253) {
    return { valid: false, reason: 'Domain must be 3-253 characters' }
  }
  
  // Check platform domains
  const platformDomains = getPlatformDomains()
  for (const platformDomain of platformDomains) {
    if (normalized === platformDomain || normalized.endsWith('.' + platformDomain)) {
      return { valid: false, reason: 'This domain is reserved for the platform' }
    }
  }
  
  // Check if it's a subdomain of platform domains
  for (const platformDomain of platformDomains) {
    if (normalized.endsWith('.' + platformDomain)) {
      return { valid: false, reason: 'Platform subdomains cannot be used as custom domains' }
    }
  }
  
  // Basic domain format validation
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
  if (!domainRegex.test(normalized)) {
    return { valid: false, reason: 'Invalid domain format' }
  }
  
  // Check for reserved subdomains
  const parts = normalized.split('.')
  if (parts.length > 0 && parts[0] && reservedDomains.includes(parts[0])) {
    return { valid: false, reason: 'This subdomain is reserved' }
  }
  
  // Check for consecutive dots
  if (normalized.includes('..')) {
    return { valid: false, reason: 'Domain cannot contain consecutive dots' }
  }
  
  // Check for leading/trailing hyphens in labels
  for (const part of parts) {
    if (part.startsWith('-') || part.endsWith('-')) {
      return { valid: false, reason: 'Domain parts cannot start or end with hyphens' }
    }
  }
  
  return { valid: true }
}

// Generate DNS verification token
export function generateVerificationToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

// Get DNS TXT record name for verification
export function getVerificationRecordName(domain: string): string {
  return `_krabiclaw.${normalizeDomain(domain)}`
}

// Get legacy DNS TXT record name for backward compatibility
export function getLegacyVerificationRecordName(domain: string): string {
  return `_thaiclawai.${normalizeDomain(domain)}`
}

// Check if user has custom domains entitlement
export async function hasCustomDomainsEntitlement(
  env: DomainEnv,
  db: any,
  organizationId: string
): Promise<boolean> {
  try {
    const entitlement = await db.prepare(`
      SELECT value FROM organization_entitlements 
      WHERE organization_id = ? AND key = 'custom_domains'
      LIMIT 1
    `).bind(organizationId).first()
    
    return entitlement?.value.toLowerCase() === 'true'
  } catch (error) {
    console.error('Failed to check custom domains entitlement:', error)
    return false
  }
}

// Check if domain is already in use
export async function isDomainAvailable(
  db: any,
  domain: string,
  excludeSiteId?: string
): Promise<boolean> {
  try {
    const normalized = normalizeDomain(domain)
    
    let query = `
      SELECT id FROM site_domains 
      WHERE domain = ? AND status = 'active'
    `
    const params = [normalized]
    
    if (excludeSiteId) {
      query += ' AND site_id != ?'
      params.push(excludeSiteId)
    }
    
    const existing = await db.prepare(query).bind(...params).first()
    
    return !existing
  } catch (error) {
    console.error('Failed to check domain availability:', error)
    return false
  }
}

// Get DNS TXT record (mock implementation - would use DNS lookup service)
export async function getDnsTxtRecord(domain: string): Promise<string | null> {
  // In production, this would use a DNS lookup service
  // For now, return null to indicate manual verification
  return null
}

// Verify DNS TXT record matches expected token
export async function verifyDnsRecord(
  db: any,
  domainId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    // Get domain record
    const domainRecord = await db.prepare(`
      SELECT domain, verification_token FROM site_domains 
      WHERE id = ? AND type = 'custom'
      LIMIT 1
    `).bind(domainId).first()
    
    if (!domainRecord) {
      return { success: false, message: 'Domain not found' }
    }
    
    if (!domainRecord.verification_token) {
      return { success: false, message: 'Verification token not set' }
    }
    
    // Get DNS TXT record
    const txtRecord = await getDnsTxtRecord(domainRecord.domain || '')
    
    if (!txtRecord) {
      return { success: false, message: 'DNS TXT record not found' }
    }
    
    // Check if record matches
    if (txtRecord.trim() === (domainRecord.verification_token || '').trim()) {
      // Mark as verified
      await db.prepare(`
        UPDATE site_domains 
        SET status = 'active', verified_at = ?, last_checked_at = ?, error_message = NULL, updated_at = ?
        WHERE id = ?
      `).bind(
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
        domainId
      ).run()
      
      return { success: true, message: 'Domain verified successfully' }
    } else {
      // Mark as failed
      await db.prepare(`
        UPDATE site_domains 
        SET status = 'failed', last_checked_at = ?, error_message = 'TXT record does not match', updated_at = ?
        WHERE id = ?
      `).bind(
        new Date().toISOString(),
        new Date().toISOString(),
        domainId
      ).run()
      
      return { success: false, message: 'TXT record does not match expected value' }
    }
  } catch (error) {
    console.error('Failed to verify DNS record:', error)
    
    // Mark as failed
    await db.prepare(`
      UPDATE site_domains 
      SET status = 'failed', last_checked_at = ?, error_message = 'Verification failed', updated_at = ?
      WHERE id = ?
    `).bind(
      new Date().toISOString(),
      new Date().toISOString(),
      domainId
    ).run()
    
    return { success: false, message: 'Verification failed' }
  }
}

// Get site domains
export async function getSiteDomains(
  db: any,
  siteId: string
): Promise<DomainRecord[]> {
  try {
    const domains = await db.prepare(`
      SELECT * FROM site_domains 
      WHERE site_id = ?
      ORDER BY type ASC, created_at ASC
    `).bind(siteId).all()
    
    return domains.results || []
  } catch (error) {
    console.error('Failed to get site domains:', error)
    return []
  }
}

// Create system subdomain for site
export async function createSystemSubdomain(
  db: any,
  siteId: string,
  organizationId: string,
  subdomain: string
): Promise<DomainRecord> {
  const platformDomain = getPlatformDomain()
  if (!platformDomain) {
    throw new Error('Platform domain is required for subdomain creation')
  }
  const domain = `${subdomain}.${platformDomain}`
  const now = new Date().toISOString()
  const domainId = `domain-${siteId}-subdomain`
  
  await db.prepare(`
    INSERT OR REPLACE INTO site_domains 
    (id, organization_id, site_id, domain, type, status, verification_method, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    domainId,
    organizationId,
    siteId,
    domain,
    'subdomain',
    'active',
    'dns_txt',
    now,
    now
  ).run()
  
  return {
    id: domainId,
    organization_id: organizationId,
    site_id: siteId,
    domain,
    type: 'subdomain',
    status: 'active',
    verification_method: 'dns_txt',
    created_at: now,
    updated_at: now
  }
}

// Create custom domain
export async function createCustomDomain(
  db: any,
  siteId: string,
  organizationId: string,
  domain: string
): Promise<DomainRecord> {
  const normalized = normalizeDomain(domain)
  const now = new Date().toISOString()
  const domainId = `domain-${siteId}-${Date.now()}`
  const verificationToken = generateVerificationToken()
  
  await db.prepare(`
    INSERT INTO site_domains 
    (id, organization_id, site_id, domain, type, status, verification_token, verification_method, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    domainId,
    organizationId,
    siteId,
    normalized,
    'custom',
    'pending',
    verificationToken,
    'dns_txt',
    now,
    now
  ).run()
  
  return {
    id: domainId,
    organization_id: organizationId,
    site_id: siteId,
    domain: normalized,
    type: 'custom',
    status: 'pending',
    verification_token: verificationToken,
    verification_method: 'dns_txt',
    created_at: now,
    updated_at: now
  }
}
