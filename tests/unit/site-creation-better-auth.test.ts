import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

type Organization = { id: string; name: string; slug: string; createdAt: Date; metadata?: Record<string, unknown> }
type Member = { id: string; organizationId: string; userId: string; role: string }

const organizations: Organization[] = []
const members: Member[] = []
const sitesByOrganization = new Map<string, Array<{ id?: string; site_id: string; onboarding_status: string | null }>>()
const adapterCalls: Array<{ method: string; args: unknown[] }> = []
let failMemberCreate = false
let simulateUnmarkedDuplicate = false
let createdOrganizationNumber = 0
let organizationPlan = 'free'
const executedQueries: string[] = []

const authApi = {
  createOrganization: async (input: {
    body: {
      name: string
      slug: string
      userId: string
      keepCurrentActiveOrganization: boolean
      metadata: Record<string, string>
    }
  }) => {
    adapterCalls.push({ method: 'api.createOrganization', args: [input] })
    if (simulateUnmarkedDuplicate) {
      organizations.push({
        id: 'org-concurrent',
        name: input.body.name,
        slug: input.body.slug,
        createdAt: new Date(),
        metadata: { unrelated: 'metadata' },
      })
      throw new Error('organization already exists')
    }
    const organization = {
      id: `org-created-${++createdOrganizationNumber}`,
      name: input.body.name,
      slug: input.body.slug,
      createdAt: new Date(),
      metadata: { ...input.body.metadata, existing: 'metadata' },
    }
    organizations.push(organization)
    if (failMemberCreate) throw new Error('member creation failed')
    members.push({
      id: `member-created-${createdOrganizationNumber}`,
      organizationId: organization.id,
      userId: input.body.userId,
      role: 'owner',
    })
    return organization
  },
}

const organizationAdapter = {
  listOrganizations: async (_userId: string) => organizations,
  findMemberByOrgId: async (input: { userId: string; organizationId: string }) => {
    adapterCalls.push({ method: 'findMemberByOrgId', args: [input] })
    return members.find((member) => member.userId === input.userId && member.organizationId === input.organizationId) ?? null
  },
  findOrganizationBySlug: async (slug: string) => organizations.find((organization) => organization.slug === slug) ?? null,
  findOrganizationById: async (organizationId: string) => organizations.find((organization) => organization.id === organizationId) ?? null,
  updateOrganization: async (organizationId: string, data: unknown) => {
    adapterCalls.push({ method: 'updateOrganization', args: [organizationId, data] })
    const organization = organizations.find((candidate) => candidate.id === organizationId)
    if (organization && data && typeof data === 'object' && 'metadata' in data) {
      organization.metadata = (data as { metadata?: Record<string, unknown> }).metadata
    }
    return organization ?? null
  },
  deleteOrganization: async (organizationId: string) => {
    adapterCalls.push({ method: 'deleteOrganization', args: [organizationId] })
    const index = organizations.findIndex((organization) => organization.id === organizationId)
    if (index >= 0) organizations.splice(index, 1)
    for (let i = members.length - 1; i >= 0; i--) {
      if (members[i]?.organizationId === organizationId) members.splice(i, 1)
    }
    return organizationId
  },
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (_db: unknown, query: string) => {
      executedQueries.push(query)
      return { meta: { changes: 1 } }
    },
    queryFirst: async () => undefined,
    queryAll: async <T>(_db: unknown, query: string, params: unknown[]) => {
      if (query.includes('FROM sites')) return (sitesByOrganization.get(String(params[0])) ?? []) as T[]
      return [] as T[]
    },
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({ $context: Promise.resolve({}), api: authApi }),
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => organizationAdapter,
  },
})

mock.module('../../server/utils/site-template.ts', { namedExports: { seedNewSite: async () => {} } })
mock.module('../../server/utils/domains.ts', { namedExports: { createSystemSubdomain: async () => ({}) } })
mock.module('../../server/utils/billing.ts', {
  namedExports: {
    getOrganizationBillingStatus: async () => ({ plan: organizationPlan }),
    setSiteEntitlementsFromPlan: async () => {},
  },
})
mock.module('../../server/utils/member-access.ts', { namedExports: { ensureSiteTeam: async () => 'site:team' } })

const {
  createOrganizationForSite,
  findOldestOwnedOrganization,
  resolveCreationOrganization,
  runSiteCreation,
} = await import('../../server/utils/site-creation.ts')

test.beforeEach(() => {
  organizations.length = 0
  members.length = 0
  sitesByOrganization.clear()
  adapterCalls.length = 0
  failMemberCreate = false
  simulateUnmarkedDuplicate = false
  createdOrganizationNumber = 0
  organizationPlan = 'free'
  executedQueries.length = 0
})

test('site creation resolves the oldest owned organization through Better Auth and app-owned site rows', async () => {
  organizations.push(
    { id: 'org-new', name: 'New', slug: 'new', createdAt: new Date('2026-02-01T00:00:00Z') },
    { id: 'org-old', name: 'Old', slug: 'old', createdAt: new Date('2026-01-01T00:00:00Z') },
  )
  members.push(
    { id: 'member-new', organizationId: 'org-new', userId: 'user-1', role: 'owner' },
    { id: 'member-old', organizationId: 'org-old', userId: 'user-1', role: 'owner' },
  )

  const organizationId = await findOldestOwnedOrganization({} as never, 'user-1')
  assert.equal(organizationId, 'org-old')
  assert.ok(adapterCalls.some((call) => call.method === 'findMemberByOrgId'))
})

test('invalid Better Auth timestamps sort after valid organizations', async () => {
  organizations.push(
    { id: 'org-invalid', name: 'Invalid', slug: 'invalid', createdAt: new Date('invalid') },
    { id: 'org-valid', name: 'Valid', slug: 'valid', createdAt: new Date('2026-01-01T00:00:00Z') },
  )
  members.push(
    { id: 'member-invalid', organizationId: 'org-invalid', userId: 'user-1', role: 'owner' },
    { id: 'member-valid', organizationId: 'org-valid', userId: 'user-1', role: 'owner' },
  )

  const organizationId = await findOldestOwnedOrganization({} as never, 'user-1')
  assert.equal(organizationId, 'org-valid')
})

test('site creation globally prioritizes an owned retry over an older active organization', async () => {
  organizations.push(
    { id: 'org-active', name: 'Active', slug: 'active', createdAt: new Date('2026-01-01T00:00:00Z') },
    { id: 'org-retry', name: 'Retry', slug: 'retry', createdAt: new Date('2026-02-01T00:00:00Z') },
  )
  members.push(
    { id: 'member-active', organizationId: 'org-active', userId: 'user-1', role: 'owner' },
    { id: 'member-retry', organizationId: 'org-retry', userId: 'user-1', role: 'owner' },
  )
  sitesByOrganization.set('org-active', [{ id: 'site-active', site_id: 'site-active', onboarding_status: 'active' }])
  sitesByOrganization.set('org-retry', [{ id: 'site-retry', site_id: 'site-retry', onboarding_status: 'failed' }])

  const result = await resolveCreationOrganization({} as never, {} as never, 'user-1', 'Retry')
  assert.deepEqual(result, { organizationId: 'org-retry', existingRetrySiteId: 'site-retry' })
})

test('an editor-only membership receives a new owned organization instead of reusing its scoped site', async () => {
  organizations.push({
    id: 'org-editor',
    name: 'Editor',
    slug: 'editor',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  })
  members.push({ id: 'member-editor', organizationId: 'org-editor', userId: 'user-1', role: 'editor' })
  sitesByOrganization.set('org-editor', [{ id: 'site-editor', site_id: 'site-editor', onboarding_status: 'failed' }])

  const result = await resolveCreationOrganization({} as never, {} as never, 'user-1', 'New owner org')

  assert.match(result.organizationId, /^org-/)
  assert.equal(result.existingRetrySiteId, undefined)
  assert.ok(members.some(member => member.organizationId === result.organizationId && member.userId === 'user-1' && member.role === 'owner'))
  const createCall = adapterCalls.find(call => call.method === 'api.createOrganization')
  assert.ok(createCall)
  const body = (createCall?.args[0] as { body: {
    name: string
    slug: string
    userId: string
    keepCurrentActiveOrganization: boolean
    metadata: Record<string, unknown>
  } }).body
  assert.deepEqual(body, {
    name: 'New owner org',
    slug: 'new-owner-org',
    userId: 'user-1',
    keepCurrentActiveOrganization: true,
    metadata: body.metadata,
  })
  assert.equal(typeof body.metadata.__krabiclaw_site_creation_marker, 'string')
  assert.deepEqual(organizations.find(organization => organization.id === result.organizationId)?.metadata, { existing: 'metadata' })
})

test('organization creation compensates by deleting an org if member creation fails', async () => {
  failMemberCreate = true
  await assert.rejects(
    () => createOrganizationForSite({} as never, 'user-1', 'Acme'),
    /member creation failed/,
  )
  assert.ok(adapterCalls.some((call) => call.method === 'deleteOrganization'))
  assert.equal(organizations.length, 0)
})

test('organization creation never deletes an unmarked organization that won a slug race', async () => {
  simulateUnmarkedDuplicate = true
  await assert.rejects(
    () => createOrganizationForSite({} as never, 'user-1', 'Acme'),
    /organization already exists/,
  )
  assert.equal(organizations.some(organization => organization.id === 'org-concurrent'), true)
  assert.equal(adapterCalls.some(call => call.method === 'deleteOrganization'), false)
})

test('site creation activates the organization before any site write', async () => {
  let activated = false
  const result = await runSiteCreation(
    {} as never,
    {} as never,
    'user-1',
    { name: 'New site', subdomain: 'new-site', vertical: 'restaurant' },
    {
      beforeSiteMutation: async () => {
        activated = true
        throw new Error('activation failed')
      },
    },
  )
  assert.equal(result.status, 500)
  assert.equal(result.data.error, 'activation failed')
  assert.equal(activated, true)
  assert.equal(executedQueries.some(query => /INSERT\s+INTO\s+sites/i.test(query)), false)
})

test('a new site inherits the organization plan without offering a second subscription', async () => {
  organizations.push({
    id: 'org-paid',
    name: 'Paid organization',
    slug: 'paid-organization',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  })
  members.push({ id: 'member-paid', organizationId: 'org-paid', userId: 'user-1', role: 'owner' })
  sitesByOrganization.set('org-paid', [{
    id: 'site-existing',
    site_id: 'site-existing',
    onboarding_status: 'active',
  }])
  organizationPlan = 'growth'

  const result = await runSiteCreation(
    {} as never,
    {} as never,
    'user-1',
    { name: 'Second site', subdomain: 'e2e-second-site', vertical: 'restaurant' },
  )

  assert.equal(result.status, 200)
  assert.equal('offerSubscribePlan' in result.data, false)
  assert.equal(executedQueries.some(query => /\bsite_billing\b/i.test(query)), false)
})
