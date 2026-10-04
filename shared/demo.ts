/**
 * Canonical demo organization and host contracts.
 *
 * The synthetic "Ember & Slice" showcase site is not a real business.
 * It is managed exclusively by platform admins, its data is non-customer demo data,
 * and it must never be crawled or indexed by search engines.
 */

export const DEMO_ORG_ID = 'org-demo'

export const DEMO_HOSTS = new Set([
  'demo.krabiclaw.com',
  'demo.localhost',
])

export function isDemoOrg(organizationId?: string | null): boolean {
  return organizationId === DEMO_ORG_ID
}

export function isDemoHost(host?: string | null): boolean {
  if (!host) return false
  const hostname = host.toLowerCase().replace(/\.$/, '').split(':')[0] || ''
  return DEMO_HOSTS.has(hostname)
}
