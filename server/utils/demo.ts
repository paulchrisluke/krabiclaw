// Platform demo org — managed by platform admins only.
// Regular users must never be added as members, and all writes are blocked at the API layer.
export const DEMO_ORG_ID = 'org-demo'
export const DEMO_SITE_ID = 'site-demo'

export function isDemoOrg(organizationId: string): boolean {
  return organizationId === DEMO_ORG_ID
}
