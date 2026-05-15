// Cloudflare for SaaS custom domain management.

export interface DomainEnv {
  CF_ZONE_ID?: string
  CF_CUSTOM_HOSTNAMES_API_TOKEN?: string
  CF_SAAS_CNAME_TARGET?: string
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export type DomainStatus = 'pending' | 'verifying' | 'active' | 'blocked' | 'failed' | 'disabled' | 'deleted'
export type DomainRole = 'canonical' | 'secondary'

export interface DomainRecord {
  id: string
  organization_id: string
  site_id: string
  domain: string
  type: 'subdomain' | 'custom'
  role: DomainRole
  status: DomainStatus
  cloudflare_hostname_id?: string | null
  cloudflare_hostname_status?: string | null
  cloudflare_ssl_status?: string | null
  ownership_validation_name?: string | null
  ownership_validation_type?: string | null
  ownership_validation_value?: string | null
  ssl_validation_name?: string | null
  ssl_validation_type?: string | null
  ssl_validation_value?: string | null
  dns_target?: string | null
  dns_status?: 'pending' | 'valid' | 'invalid' | 'unknown'
  last_synced_at?: string | null
  next_check_at?: string | null
  retry_count?: number
  activated_at?: string | null
  error_message?: string | null
  metadata?: string | null
  created_at: string
  updated_at: string
}

interface CloudflareCustomHostname {
  id: string
  hostname: string
  status?: string
  ownership_verification?: {
    name?: string
    type?: string
    value?: string
  }
  ownership_verification_http?: {
    http_url?: string
    http_body?: string
  }
  ssl?: {
    id?: string
    status?: string
    validation_records?: Array<{
      txt_name?: string
      txt_value?: string
      name?: string
      type?: string
      value?: string
    }>
  }
  verification_errors?: string[]
  created_at?: string
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const MAX_RETRY_COUNT = 12

const reservedDomains = [
  'app', 'api', 'admin', 'dashboard', 'login', 'signup',
  'pricing', 'billing', 'support', 'help', 'docs', 'blog', 'posts',
  'qa', 'legal', 'terms', 'privacy', 'static', 'assets', 'cdn',
  'mail', 'status', 'staging', 'dev', 'test', 'beta', 'demo',
  'ns1', 'ns2', 'mx', 'txt', 'cname', 'a', 'aaaa'
]

export function platformHostname(env: DomainEnv): string {
  const domain = env.NUXT_PUBLIC_FREE_SITE_DOMAIN
  if (!domain) throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN is required')
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function platformDomainCandidates(env: DomainEnv): string[] {
  const values = [
    env.NUXT_PUBLIC_FREE_SITE_DOMAIN,
    env.NUXT_PUBLIC_PLATFORM_DOMAIN,
    'krabiclaw.com'
  ]

  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase())
}

export function normalizeDomain(domain: string): string {
  if (!domain) return ''

  return domain
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.split('?')[0]
    ?.split('#')[0]
    ?.trim()
    ?.toLowerCase()
    ?.replace(/\.$/, '') || ''
}

export function rootDomainForPair(domain: string): string {
  const normalized = normalizeDomain(domain)
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized
}

export function domainPair(domain: string, includeWww = true): string[] {
  const root = rootDomainForPair(domain)
  return includeWww ? [root, `www.${root}`] : [normalizeDomain(domain)]
}

export function canonicalDomainForPair(domain: string, includeWww = true): string {
  const root = rootDomainForPair(domain)
  return includeWww ? `www.${root}` : normalizeDomain(domain)
}

export function validateCustomDomain(env: DomainEnv, domain: string): { valid: boolean; reason?: string } {
  const normalized = normalizeDomain(domain)

  if (!normalized) return { valid: false, reason: 'Domain is required' }
  if (normalized.length < 3 || normalized.length > 253) return { valid: false, reason: 'Domain must be 3-253 characters' }

  const labels = normalized.split('.')
  if (labels.length < 2) return { valid: false, reason: 'Use a full domain such as restaurant.com' }
  if (normalized.includes('..')) return { valid: false, reason: 'Domain cannot contain consecutive dots' }

  const labelRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
  for (const label of labels) {
    if (!labelRegex.test(label)) return { valid: false, reason: 'Invalid domain format' }
  }

  for (const platformDomain of platformDomainCandidates(env)) {
    if (normalized === platformDomain || normalized.endsWith(`.${platformDomain}`)) {
      return { valid: false, reason: 'This domain is reserved for KrabiClaw platform traffic' }
    }
  }

  const firstLabel = labels[0]
  if (firstLabel !== 'www' && reservedDomains.includes(firstLabel || '')) {
    return { valid: false, reason: 'This hostname is reserved' }
  }

  return { valid: true }
}

export async function hasCustomDomainsEntitlement(db: D1Database, organizationId: string): Promise<boolean> {
  const entitlement = await db.prepare(`
    SELECT value FROM organization_entitlements
    WHERE organization_id = ? AND key = 'custom_domains'
    LIMIT 1
  `).bind(organizationId).first()

  return String(entitlement?.value || '').toLowerCase() === 'true'
}

export async function getSiteDomains(db: D1Database, siteId: string): Promise<DomainRecord[]> {
  const domains = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE site_id = ? AND status != 'deleted'
    ORDER BY type ASC, role ASC, created_at ASC
  `).bind(siteId).all()

  return (domains.results || []) as unknown as DomainRecord[]
}

export async function ensureDomainAvailable(db: D1Database, domains: string[], excludeSiteId?: string): Promise<void> {
  const placeholders = domains.map(() => '?').join(', ')
  const params = excludeSiteId ? [...domains, excludeSiteId] : domains
  const exclusion = excludeSiteId ? 'AND site_id != ?' : ''

  const existing = await db.prepare(`
    SELECT domain
    FROM site_domains
    WHERE domain IN (${placeholders}) AND status != 'deleted' ${exclusion}
    LIMIT 1
  `).bind(...params).first()

  if (existing?.domain) throw new Error(`${existing.domain} is already in use`)
}

export async function createSystemSubdomain(
  env: DomainEnv,
  db: D1Database,
  siteId: string,
  organizationId: string,
  subdomain: string
): Promise<DomainRecord> {
  const now = new Date().toISOString()
  const domain = `${subdomain}.${platformHostname(env)}`
  const id = `domain-${siteId}-subdomain`

  let cloudflareId: string | null = null
  let cloudflareStatus: string | null = null

  try {
    // Best-effort: provision in Cloudflare Custom Hostnames for tracking/SSL control
    const hostname = await createCloudflareHostname(env, siteId, organizationId, domain)
    cloudflareId = hostname.id
    cloudflareStatus = hostname.status || 'pending'
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Cloudflare provisioning failed')
    console.error('createSystemSubdomain: Cloudflare API failed', { domain, error: normalizedError.message })
    // We continue so the user still has a working site record in our DB
  }

  await db.prepare(`
    INSERT OR REPLACE INTO site_domains
    (id, organization_id, site_id, domain, type, role, status, dns_status, dns_target, cloudflare_hostname_id, cloudflare_hostname_status, activated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'subdomain', 'canonical', 'active', 'valid', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, organizationId, siteId, domain, 
    platformHostname(env), 
    cloudflareId, cloudflareStatus,
    now, now, now
  ).run()

  await db.prepare(`
    UPDATE sites
    SET public_url = ?, updated_at = ?
    WHERE id = ? AND organization_id = ?
  `).bind(`https://${domain}`, now, siteId, organizationId).run()

  return (await db.prepare(`SELECT * FROM site_domains WHERE id = ?`).bind(id).first()) as DomainRecord
}

function requireCloudflareConfig(env: DomainEnv) {
  if (!env.CF_ZONE_ID) throw new Error('CF_ZONE_ID is required')
  if (!env.CF_CUSTOM_HOSTNAMES_API_TOKEN) throw new Error('CF_CUSTOM_HOSTNAMES_API_TOKEN is required')
  if (!env.CF_SAAS_CNAME_TARGET) throw new Error('CF_SAAS_CNAME_TARGET is required')
}

async function cloudflareRequest<T>(
  env: DomainEnv,
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  requireCloudflareConfig(env)

  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      Authorization: `Bearer ${env.CF_CUSTOM_HOSTNAMES_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  })

  const body = await response.json().catch(() => null) as ApiValue
  if (!response.ok || body?.success === false) {
    const message = body?.errors?.map((err: ApiValue) => err.message).filter(Boolean).join('; ') || `Cloudflare API HTTP ${response.status}`
    throw new Error(message)
  }

  return body.result as T
}

async function createCloudflareHostname(
  env: DomainEnv,
  siteId: string,
  organizationId: string,
  hostname: string,
  signal?: AbortSignal
): Promise<CloudflareCustomHostname> {
  return cloudflareRequest<CloudflareCustomHostname>(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      custom_metadata: { site_id: siteId, organization_id: organizationId },
      ssl: {
        method: 'txt',
        type: 'dv',
        bundle_method: 'ubiquitous',
        certificate_authority: 'google'
      }
    })
  }, signal)
}

async function getCloudflareHostname(env: DomainEnv, id: string, signal?: AbortSignal): Promise<CloudflareCustomHostname> {
  return cloudflareRequest<CloudflareCustomHostname>(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames/${id}`, {}, signal)
}

async function deleteCloudflareHostname(env: DomainEnv, id: string): Promise<void> {
  await cloudflareRequest(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames/${id}`, { method: 'DELETE' })
}

function firstSslValidation(hostname: CloudflareCustomHostname) {
  return hostname.ssl?.validation_records?.[0] || null
}

export function mapCloudflareStatus(hostnameStatus?: string, sslStatus?: string, dnsStatus: string = 'pending'): DomainStatus {
  if (hostnameStatus === 'active' && sslStatus === 'active' && dnsStatus === 'valid') return 'active'
  if (hostnameStatus === 'blocked') return 'blocked'
  if (hostnameStatus === 'moved' || hostnameStatus === 'deleted') return 'failed'
  if (hostnameStatus === 'pending' || hostnameStatus === 'pending_validation' || sslStatus === 'pending_validation') return 'verifying'
  if (hostnameStatus === 'active' || sslStatus === 'active') return 'verifying'
  return 'pending'
}

function nextCheckAt(retryCount: number): string {
  const delayMinutes = Math.min(1440, Math.max(5, 5 * 2 ** Math.min(retryCount, 7)))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

async function logDomainEvent(
  db: D1Database,
  opts: {
    organizationId: string
    siteId: string
    domainId?: string | null
    eventType: string
    actorType?: 'owner' | 'admin' | 'system' | 'cloudflare'
    actorId?: string | null
    message?: string
    beforeState?: ApiValue
    afterState?: ApiValue
    metadata?: ApiValue
  }
) {
  await db.prepare(`
    INSERT INTO site_domain_events
    (id, organization_id, site_id, domain_id, event_type, actor_type, actor_id, message, before_state, after_state, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    opts.organizationId,
    opts.siteId,
    opts.domainId ?? null,
    opts.eventType,
    opts.actorType ?? 'system',
    opts.actorId ?? null,
    opts.message ?? null,
    opts.beforeState ? JSON.stringify(opts.beforeState) : null,
    opts.afterState ? JSON.stringify(opts.afterState) : null,
    opts.metadata ? JSON.stringify(opts.metadata) : null,
    new Date().toISOString()
  ).run()
}

async function queueReconciliation(db: D1Database, domainId: string, runAfter?: string) {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO domain_reconciliation_jobs (id, domain_id, status, run_after, attempts, created_at, updated_at)
    VALUES (?, ?, 'queued', ?, 0, ?, ?)
    ON CONFLICT(domain_id) DO UPDATE SET status = 'queued', run_after = excluded.run_after, updated_at = excluded.updated_at
  `).bind(`domain-job-${domainId}`, domainId, runAfter ?? now, now, now).run()
}

async function persistCloudflareState(
  env: DomainEnv,
  db: D1Database,
  domainId: string,
  hostname: CloudflareCustomHostname,
  options: { incrementRetry?: boolean; actorType?: 'owner' | 'admin' | 'system' | 'cloudflare'; actorId?: string | null } = {}
): Promise<DomainRecord> {
  const before = await db.prepare(`SELECT * FROM site_domains WHERE id = ?`).bind(domainId).first() as DomainRecord | null
  if (!before) throw new Error('Domain not found')

  const sslValidation = firstSslValidation(hostname)
  const dnsTarget = env.CF_SAAS_CNAME_TARGET || null
  const retryCount = options.incrementRetry ? Math.min(MAX_RETRY_COUNT, Number(before.retry_count || 0) + 1) : Number(before.retry_count || 0)
  const dnsStatus = hostname.status === 'active' ? 'valid' : (before.dns_status || 'pending')
  const status = mapCloudflareStatus(hostname.status, hostname.ssl?.status, dnsStatus)
  const now = new Date().toISOString()
  const activatedAt = status === 'active' ? (before.activated_at || now) : before.activated_at
  const errors = hostname.verification_errors?.join('; ') || null

  if (status === 'active' && before.role === 'canonical') {
    await db.prepare(`
      UPDATE site_domains
      SET role = 'secondary', updated_at = ?
      WHERE site_id = ?
        AND id != ?
        AND role = 'canonical'
        AND EXISTS (
          SELECT 1
          FROM site_domains expected
          WHERE expected.id = ? AND expected.role = 'canonical'
        )
    `).bind(now, before.site_id, domainId, domainId).run()
  }

  await db.prepare(`
    UPDATE site_domains
    SET cloudflare_hostname_id = ?,
        cloudflare_hostname_status = ?,
        cloudflare_ssl_status = ?,
        ownership_validation_name = ?,
        ownership_validation_type = ?,
        ownership_validation_value = ?,
        ssl_validation_name = ?,
        ssl_validation_type = ?,
        ssl_validation_value = ?,
        dns_target = ?,
        dns_status = ?,
        status = ?,
        last_synced_at = ?,
        next_check_at = ?,
        retry_count = ?,
        activated_at = ?,
        error_message = ?,
        metadata = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    hostname.id,
    hostname.status ?? null,
    hostname.ssl?.status ?? null,
    hostname.ownership_verification?.name ?? null,
    hostname.ownership_verification?.type ?? null,
    hostname.ownership_verification?.value ?? null,
    sslValidation?.txt_name ?? sslValidation?.name ?? null,
    sslValidation?.type ?? 'TXT',
    sslValidation?.txt_value ?? sslValidation?.value ?? null,
    dnsTarget,
    dnsStatus,
    status,
    now,
    status === 'active' || status === 'disabled' || status === 'deleted' ? null : nextCheckAt(retryCount),
    retryCount,
    activatedAt,
    errors,
    JSON.stringify({ cloudflare_created_at: hostname.created_at ?? null }),
    now,
    domainId
  ).run()

  const after = await db.prepare(`SELECT * FROM site_domains WHERE id = ?`).bind(domainId).first() as DomainRecord

  if (!before || before.status !== after.status || before.cloudflare_ssl_status !== after.cloudflare_ssl_status) {
    await logDomainEvent(db, {
      organizationId: after.organization_id,
      siteId: after.site_id,
      domainId,
      eventType: 'domain_state_changed',
      actorType: options.actorType ?? 'cloudflare',
      actorId: options.actorId ?? null,
      message: `${after.domain} is ${after.status}`,
      beforeState: before,
      afterState: after
    })
  }

  if (after.status === 'active') await promoteCanonicalIfReady(db, after.site_id)
  else await queueReconciliation(db, domainId, after.next_check_at || undefined)

  return after
}

export async function createCustomDomainPair(
  env: DomainEnv,
  db: D1Database,
  opts: {
    siteId: string
    organizationId: string
    domain: string
    includeWww?: boolean
    actorId?: string | null
    actorType?: 'owner' | 'admin'
  }
): Promise<DomainRecord[]> {
  const domains = domainPair(opts.domain, opts.includeWww !== false)
  const canonical = canonicalDomainForPair(opts.domain, opts.includeWww !== false)
  await ensureDomainAvailable(db, domains, opts.siteId)

  const now = new Date().toISOString()
  const entries = domains.map((domain) => ({
    id: crypto.randomUUID(),
    domain,
    role: (domain === canonical ? 'canonical' : 'secondary') as DomainRole
  }))
  const cloudflareByDomainId = new Map<string, CloudflareCustomHostname>()
  const createdHostnameIds: string[] = []
  const records: DomainRecord[] = []

  try {
    // External side-effect first: provision both hostnames before DB commit.
    for (const entry of entries) {
      const hostname = await createCloudflareHostname(env, opts.siteId, opts.organizationId, entry.domain)
      cloudflareByDomainId.set(entry.id, hostname)
      if (hostname.id) createdHostnameIds.push(hostname.id)
    }

    await db.exec('BEGIN IMMEDIATE TRANSACTION')
    try {
      for (const entry of entries) {
        await db.prepare(`
          INSERT INTO site_domains
          (id, organization_id, site_id, domain, type, role, status, dns_target, dns_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'custom', ?, 'pending', ?, 'pending', ?, ?)
        `).bind(entry.id, opts.organizationId, opts.siteId, entry.domain, entry.role, env.CF_SAAS_CNAME_TARGET, now, now).run()

        await logDomainEvent(db, {
          organizationId: opts.organizationId,
          siteId: opts.siteId,
          domainId: entry.id,
          eventType: 'domain_added',
          actorType: opts.actorType ?? 'owner',
          actorId: opts.actorId ?? null,
          message: `${entry.domain} added`
        })
      }

      for (const entry of entries) {
        const hostname = cloudflareByDomainId.get(entry.id)
        if (!hostname) throw new Error(`Missing Cloudflare hostname for ${entry.domain}`)
        records.push(await persistCloudflareState(env, db, entry.id, hostname, { actorType: 'cloudflare' }))
      }

      await db.exec('COMMIT')
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Cloudflare hostname creation failed')
    const message = normalizedError.message || 'Cloudflare hostname creation failed'

    // Best-effort external cleanup if any Cloudflare hostnames were already created.
    for (const hostnameId of createdHostnameIds) {
      try {
        await deleteCloudflareHostname(env, hostnameId)
      } catch (cleanupError) {
        const normalizedCleanupError = cleanupError instanceof Error ? cleanupError : new Error('unknown cleanup error')
        console.error('createCustomDomainPair: Cloudflare cleanup failed', {
          hostnameId,
          error: normalizedCleanupError.message
        })
      }
    }

    for (const entry of entries) {
      await logDomainEvent(db, {
        organizationId: opts.organizationId,
        siteId: opts.siteId,
        eventType: 'cloudflare_create_failed',
        actorType: 'cloudflare',
        message: `${entry.domain}: ${message}`,
        metadata: { domain: entry.domain, error: message }
      })
    }

    throw new Error(message)
  }

  return records
}

export async function syncDomainWithCloudflare(
  env: DomainEnv,
  db: D1Database,
  domainId: string,
  actorType: 'owner' | 'admin' | 'system' = 'system',
  actorId?: string | null,
  signal?: AbortSignal
): Promise<DomainRecord> {
  try {
    signal?.throwIfAborted()

    const domain = await db.prepare(`SELECT * FROM site_domains WHERE id = ? AND type = 'custom'`).bind(domainId).first() as DomainRecord | null
    if (!domain) throw new Error('Domain not found')

    if (!domain.cloudflare_hostname_id) {
      const hostname = await createCloudflareHostname(env, domain.site_id, domain.organization_id, domain.domain, signal)
      signal?.throwIfAborted()
      return persistCloudflareState(env, db, domainId, hostname, { incrementRetry: true, actorType, actorId })
    }

    const hostname = await getCloudflareHostname(env, domain.cloudflare_hostname_id, signal)
    signal?.throwIfAborted()
    return persistCloudflareState(env, db, domainId, hostname, { incrementRetry: true, actorType, actorId })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    if (normalizedError.name === 'AbortError') {
      const abortError = new Error('Domain sync aborted')
      abortError.name = 'AbortError'
      throw abortError
    }
    throw normalizedError
  }
}

export async function deleteCustomDomain(
  env: DomainEnv,
  db: D1Database,
  domainId: string,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null
): Promise<void> {
  const domain = await db.prepare(`SELECT * FROM site_domains WHERE id = ? AND type = 'custom'`).bind(domainId).first() as DomainRecord | null
  if (!domain) throw new Error('Domain not found')

  let cloudflareDeleteError: string | null = null
  if (domain.cloudflare_hostname_id) {
    try {
      await deleteCloudflareHostname(env, domain.cloudflare_hostname_id)
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Cloudflare hostname deletion failed')
      cloudflareDeleteError = normalizedError.message || 'Cloudflare hostname deletion failed'
      console.error('deleteCustomDomain: failed to delete Cloudflare hostname', {
        domainId,
        cloudflareHostnameId: domain.cloudflare_hostname_id,
        error: cloudflareDeleteError
      })
    }
  }

  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE site_domains
    SET status = 'deleted', role = 'secondary',
        error_message = COALESCE(?, error_message),
        updated_at = ?
    WHERE id = ?
  `).bind(cloudflareDeleteError ? `Cloudflare delete failed: ${cloudflareDeleteError}` : null, now, domainId).run()
  await db.prepare(`DELETE FROM domain_reconciliation_jobs WHERE domain_id = ?`).bind(domainId).run()
  if (cloudflareDeleteError) {
    await logDomainEvent(db, {
      organizationId: domain.organization_id,
      siteId: domain.site_id,
      domainId,
      eventType: 'cloudflare_delete_failed',
      actorType: 'cloudflare',
      message: cloudflareDeleteError,
      metadata: {
        cloudflare_hostname_id: domain.cloudflare_hostname_id,
        error: cloudflareDeleteError
      }
    })
  }
  await logDomainEvent(db, {
    organizationId: domain.organization_id,
    siteId: domain.site_id,
    domainId,
    eventType: 'domain_deleted',
    actorType,
    actorId,
    message: `${domain.domain} deleted`,
    metadata: cloudflareDeleteError ? { cloudflare_delete_error: cloudflareDeleteError } : undefined
  })
  await promoteCanonicalIfReady(db, domain.site_id)
}

export async function deleteOrganizationCustomDomains(
  env: DomainEnv,
  db: D1Database,
  organizationId: string
): Promise<void> {
  const domains = await db.prepare(`
    SELECT id
    FROM site_domains
    WHERE organization_id = ? AND type = 'custom' AND status != 'deleted'
  `).bind(organizationId).all()

  for (const domain of domains.results || []) {
    await deleteCustomDomain(env, db, domain.id as string, 'system')
  }
}

export async function setCanonicalDomain(
  db: D1Database,
  siteId: string,
  domainId: string,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null
): Promise<DomainRecord> {
  const domain = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `).bind(domainId, siteId).first() as DomainRecord | null
  if (!domain) throw new Error('Only active domains can be canonical')

  const now = new Date().toISOString()
  await db.exec('BEGIN IMMEDIATE TRANSACTION')
  try {
    await db.prepare(`UPDATE site_domains SET role = 'secondary', updated_at = ? WHERE site_id = ? AND role = 'canonical'`).bind(now, siteId).run()
    await db.prepare(`UPDATE site_domains SET role = 'canonical', updated_at = ? WHERE id = ?`).bind(now, domainId).run()
    await updateSitePrimaryUrl(db, domain.site_id, domain.organization_id, domain.domain)
    await logDomainEvent(db, {
      organizationId: domain.organization_id,
      siteId,
      domainId,
      eventType: 'canonical_domain_changed',
      actorType,
      actorId,
      message: `${domain.domain} set as primary`
    })
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }

  const row = await db.prepare(`SELECT * FROM site_domains WHERE id = ?`).bind(domainId).first() as DomainRecord | null
  if (!row) throw new Error(`Domain not found: ${domainId}`)
  return row
}

async function promoteCanonicalIfReady(db: D1Database, siteId: string): Promise<void> {
  const activeCanonical = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE site_id = ? AND role = 'canonical' AND status = 'active'
    LIMIT 1
  `).bind(siteId).first() as DomainRecord | null

  if (activeCanonical) {
    await updateSitePrimaryUrl(db, activeCanonical.site_id, activeCanonical.organization_id, activeCanonical.domain)
    return
  }

  const activeCustom = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE site_id = ? AND type = 'custom' AND status = 'active'
    ORDER BY domain LIKE 'www.%' DESC, created_at ASC
    LIMIT 1
  `).bind(siteId).first() as DomainRecord | null

  if (activeCustom) {
    await setCanonicalDomain(db, siteId, activeCustom.id, 'system')
    return
  }

  const activeSubdomain = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE site_id = ? AND type = 'subdomain' AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(siteId).first() as DomainRecord | null

  if (!activeSubdomain) return

  await setCanonicalDomain(db, siteId, activeSubdomain.id, 'system')
}

async function updateSitePrimaryUrl(db: D1Database, siteId: string, organizationId: string, domain: string): Promise<void> {
  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE sites
    SET public_url = ?, custom_domain = ?, custom_domain_status = 'active', updated_at = ?
    WHERE id = ? AND organization_id = ?
  `).bind(`https://${domain}`, domain, now, siteId, organizationId).run()
}

export async function reconcileDueDomains(env: DomainEnv, db: D1Database, limit = 25): Promise<{ checked: number; failed: number }> {
  const rows = await db.prepare(`
    SELECT sd.id
    FROM site_domains sd
    LEFT JOIN domain_reconciliation_jobs j ON j.domain_id = sd.id
    WHERE sd.type = 'custom'
      AND sd.status IN ('pending', 'verifying', 'failed', 'blocked')
      AND (sd.next_check_at IS NULL OR sd.next_check_at <= ? OR j.run_after <= ?)
    ORDER BY COALESCE(j.run_after, sd.next_check_at, sd.created_at) ASC
    LIMIT ?
  `).bind(new Date().toISOString(), new Date().toISOString(), limit).all()

  let checked = 0
  let failed = 0

  for (const row of rows.results || []) {
    checked += 1
    const domainId = row.id as string
    const now = new Date().toISOString()
    await db.prepare(`
      UPDATE domain_reconciliation_jobs
      SET status = 'running', attempts = attempts + 1, updated_at = ?
      WHERE domain_id = ?
    `).bind(now, domainId).run()

    try {
      const domain = await syncDomainWithCloudflare(env, db, domainId, 'system')
      await db.prepare(`
        UPDATE domain_reconciliation_jobs
        SET status = ?, run_after = ?, last_error = NULL, updated_at = ?
        WHERE domain_id = ?
      `).bind(domain.status === 'active' ? 'succeeded' : 'queued', domain.next_check_at || now, now, domainId).run()
    } catch (error) {
      failed += 1
      const normalizedError = error instanceof Error ? error : new Error('Domain reconciliation failed')
      const message = normalizedError.message || 'Domain reconciliation failed'
      const current = await db.prepare(`SELECT retry_count FROM site_domains WHERE id = ?`).bind(domainId).first() as { retry_count?: number } | null
      const retryCount = Math.min(MAX_RETRY_COUNT, Number(current?.retry_count || 0) + 1)
      const runAfter = nextCheckAt(retryCount)
      await db.prepare(`
        UPDATE site_domains
        SET retry_count = ?, next_check_at = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind(retryCount, runAfter, message, now, domainId).run()
      await db.prepare(`
        UPDATE domain_reconciliation_jobs
        SET status = 'failed', run_after = ?, last_error = ?, updated_at = ?
        WHERE domain_id = ?
      `).bind(runAfter, message, now, domainId).run()
    }
  }

  return { checked, failed }
}

export function domainInstructions(domain: DomainRecord) {
  if (domain.type === 'subdomain') {
    return {
      dns: null,
      ssl: null,
      ownership: null,
      registrar_guides: {}
    }
  }

  const root = rootDomainForPair(domain.domain)
  const isApex = domain.domain === root
  const target = domain.dns_target || ''
  const sslName = domain.ssl_validation_name || ''
  const sslValue = domain.ssl_validation_value || ''

  return {
    dns: isApex
      ? { type: 'CNAME flattening or ALIAS', name: '@', value: target }
      : { type: 'CNAME', name: domain.domain.replace(`.${root}`, '') || 'www', value: target },
    ssl: sslName && sslValue ? { type: domain.ssl_validation_type || 'TXT', name: sslName, value: sslValue } : null,
    ownership: domain.ownership_validation_name && domain.ownership_validation_value
      ? { type: domain.ownership_validation_type || 'TXT', name: domain.ownership_validation_name, value: domain.ownership_validation_value }
      : null,
    registrar_guides: {
      cloudflare: 'Add a proxied or DNS-only CNAME for www. For apex, use CNAME flattening at @.',
      godaddy: 'Create a CNAME for www. For apex, use domain forwarding to www or ALIAS support if your plan offers it.',
      namecheap: 'Create a CNAME for www. For apex, use ALIAS at @ when available.',
      google_squarespace: 'Create a CNAME for www. For apex, use forwarding to www if ALIAS is unavailable.',
      generic: 'Point the hostname at the KrabiClaw SaaS target, then return here and sync.'
    }
  }
}

export async function getDomainEvents(db: D1Database, domainId: string) {
  const events = await db.prepare(`
    SELECT *
    FROM site_domain_events
    WHERE domain_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(domainId).all()

  return events.results || []
}
