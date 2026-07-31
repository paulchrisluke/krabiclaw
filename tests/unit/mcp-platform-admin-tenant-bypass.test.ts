import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

// #399: platform admins must not get tenant site access without real
// organization membership or Better Auth impersonation. These functions
// used to special-case an `isPlatformAdmin` flag to return every site (or
// any single site by id) regardless of membership; that branch is deleted
// and the parameter no longer exists in their signatures. These tests prove
// the runtime behavior for a platform-admin user id that holds no
// membership row: they must see nothing, same as any other stranger.

type MemberRow = { organization_id: string; user_id: string }
type SiteRow = { id: string; organization_id: string; theme_id: string | null; brand_name: string | null; slug: string; subdomain: string | null; custom_domain: string | null; public_url: string | null; status: string; plan: string | null; created_at: string; updated_at: string; onboarding_status: string; primary_location_id: string | null }

const members: MemberRow[] = [
  { organization_id: 'org-1', user_id: 'real-member' },
]

const sites: SiteRow[] = [
  { id: 'site-1', organization_id: 'org-1', theme_id: null, brand_name: 'Site One', slug: 'site-one', subdomain: 'site-one', custom_domain: null, public_url: null, status: 'active', plan: null, created_at: '2026-01-01', updated_at: '2026-01-01', onboarding_status: 'complete', primary_location_id: null },
]

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('FROM sites s') && query.includes('JOIN member m') && query.includes('WHERE s.id = ? AND m.userId = ?')) {
    const [siteId, userId] = params
    const site = sites.find(s => s.id === siteId)
    const isMember = members.some(m => m.organization_id === site?.organization_id && m.user_id === userId)
    return (site && isMember ? site : undefined) as T | undefined
  }
  if (query.includes('FROM mcp_workspace_preferences')) return undefined as T | undefined
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM organization o') && query.includes('JOIN member m ON o.id = m.organizationId')) {
    const [userId] = params
    return members.filter(m => m.user_id === userId).map(m => ({ id: m.organization_id })) as T[]
  }
  if (query.includes('FROM sites s') && query.includes('WHERE s.organization_id IN')) {
    return sites.filter(s => params.includes(s.organization_id)) as T[]
  }
  if (query.includes('FROM sites s') && query.includes('JOIN member m ON m.organizationId')) {
    const [userId] = params
    const orgIds = members.filter(m => m.user_id === userId).map(m => m.organization_id)
    return sites.filter(s => orgIds.includes(s.organization_id)).map(s => ({ ...s, organization_name: null, organization_slug: null, role: 'owner' })) as T[]
  }
  if (query.includes('FROM business_locations')) return [] as T[]
  throw new Error(`Unexpected queryAll query: ${query}`)
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst,
    queryAll,
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => [],
    // mcp-workflows.ts pulls in a wide module graph (billing, WhatsApp,
    // google-business, etc.) purely for other exports it doesn't use here;
    // those modules import these from '~/server/db' at load time, so they
    // need to exist even though this test never calls them.
    createDb: () => { throw new Error('createDb should not be called in this test') },
    bindSql: () => { throw new Error('bindSql should not be called in this test') },
    prepareStatement: () => { throw new Error('prepareStatement should not be called in this test') },
    batchStatements: async () => { throw new Error('batchStatements should not be called in this test') },
    rawClient: (client: unknown) => client,
    schema: {},
  },
})

const { listAccessibleSitesForMcp, resolveMcpWorkspace } = await import('../../server/utils/mcp-context.ts')
const { listSitesForUser, getSiteForMcp } = await import('../../server/utils/mcp-workflows.ts')

test('listAccessibleSitesForMcp returns nothing for a user with no membership row, even a platform admin', async () => {
  const asMember = await listAccessibleSitesForMcp({} as never, 'real-member')
  assert.equal(asMember.length, 1)
  assert.equal(asMember[0]?.id, 'site-1')

  const asNonMemberPlatformAdmin = await listAccessibleSitesForMcp({} as never, 'platform-admin-no-membership')
  assert.deepEqual(asNonMemberPlatformAdmin, [])
})

test('listSitesForUser returns nothing for a user with no membership row, even a platform admin', async () => {
  const asMember = await listSitesForUser({} as never, 'real-member')
  assert.equal(asMember.length, 1)

  const asNonMemberPlatformAdmin = await listSitesForUser({} as never, 'platform-admin-no-membership')
  assert.deepEqual(asNonMemberPlatformAdmin, [])
})

test('getSiteForMcp rejects a non-member platform admin and only resolves the site for an actual member', async () => {
  const site = await getSiteForMcp({} as never, 'site-1', 'real-member')
  assert.equal(site.id, 'site-1')

  await assert.rejects(
    () => getSiteForMcp({} as never, 'site-1', 'platform-admin-no-membership'),
    /Site not found or access denied/,
  )
})

test('resolveMcpWorkspace never resolves a site for a non-member platform admin', async () => {
  const workspace = await resolveMcpWorkspace({} as never, 'platform-admin-no-membership', { siteId: 'site-1' })
  assert.equal(workspace.site, null)
  assert.deepEqual(workspace.sites, [])

  await assert.rejects(
    () => resolveMcpWorkspace({} as never, 'platform-admin-no-membership', { siteId: 'site-1', requireSite: true }),
    /No accessible site found/,
  )
})

test('functions no longer accept an isPlatformAdmin argument at all', () => {
  assert.equal(listAccessibleSitesForMcp.length, 2)
  assert.equal(listSitesForUser.length, 2)
  assert.equal(getSiteForMcp.length, 3)
  // resolveMcpWorkspace's third parameter (options) has a default value, so
  // it and everything after it are excluded from Function.length.
  assert.equal(resolveMcpWorkspace.length, 2)
})
