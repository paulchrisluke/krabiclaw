import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Regression coverage for loadDashboardContext's own requireOrganization wiring
// (server/utils/dashboard-context-service.ts), which is distinct from the lower-level
// getDashboardContext/resolveRequestedOrganization coverage in
// dashboard-org-resolution.test.ts. loadDashboardContext previously passed
// requireOrganization: false unconditionally, which enabled session.activeOrganizationId
// as a fallback even when a URL-scoped orgSlug was explicitly requested — a request for
// an org the caller has no access to (or that doesn't exist) could silently resolve to
// whatever organization the session happened to still be "active" on. It now computes
// requireOrganization: scope?.orgSlug ? true : false — this test guards that expression
// specifically, since dashboard-org-resolution.test.ts only exercises getDashboardContext
// with manually-supplied requireOrganization values and would not catch a regression here.

type Row = Record<string, unknown>

interface Store {
  organizations: Row[]
  members: Row[]
}

function createStore(): Store {
  return {
    organizations: [
      { id: 'org-a', name: 'Org A', slug: 'org-a', logo: null },
      { id: 'org-b', name: 'Org B', slug: 'org-b', logo: null },
    ],
    members: [
      { id: 'member-a', organizationId: 'org-a', userId: 'user-1', role: 'admin' },
      { id: 'member-b', organizationId: 'org-b', userId: 'user-1', role: 'admin' },
    ],
  }
}

let store = createStore()

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('FROM organization o') && query.includes('JOIN member m')) {
    const [userId, slugOrId] = params as [string, string]
    const bySlug = query.includes('o.slug = ?')
    const org = store.organizations.find((o) => (bySlug ? o.slug === slugOrId : o.id === slugOrId))
    if (!org) return undefined
    const member = store.members.find((m) => m.organizationId === org.id && m.userId === userId)
    if (!member) return undefined
    return { id: org.id, name: org.name, slug: org.slug, logo: org.logo, role: member.role, memberId: member.id } as T
  }
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T[]> {
  return [] as T[]
}

Object.assign(globalThis, {
  createError(input: { statusCode: number; message?: string; statusMessage?: string }) {
    return Object.assign(new Error(input.message ?? input.statusMessage ?? 'error'), input)
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll, queryFirst },
})

let sessionActiveOrganizationId: string | null = null
mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({
      user: { id: 'user-1' },
      session: { activeOrganizationId: sessionActiveOrganizationId },
    }),
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: {} }),
  },
})

mock.module('../../server/utils/member-access.ts', {
  namedExports: {
    assertDashboardPathPermission: () => {},
    assertMemberSiteAccess: async () => {},
    isOrganizationWideRole: () => true,
    resolveDashboardSiteAccess: async () => 'organization',
  },
})

mock.module('../../server/utils/feature-flags.ts', {
  namedExports: {
    isManagedServiceEnabled: () => false,
  },
})

mock.module('../../server/utils/request-metrics.ts', {
  namedExports: {
    recordRequestPhase: () => {},
    finalizeRequestMetrics: (_event: unknown, _label: string, payload: unknown) => payload,
  },
})

const { loadDashboardContext } = await import('../../server/utils/dashboard-context-service.ts')

function fakeEvent(headers: Record<string, string> = {}, path = '/api/dashboard/context') {
  return {
    req: new Request(`http://localhost${path}`, { headers }),
    context: {},
    url: new URL(`http://localhost${path}`),
    path,
  } as unknown as Parameters<typeof loadDashboardContext>[0]
}

test.beforeEach(() => {
  store = createStore()
  sessionActiveOrganizationId = null
})

test('loadDashboardContext: explicit orgSlug that does not exist, with a stale session active org, throws 404 instead of leaking the active org', async () => {
  sessionActiveOrganizationId = 'org-a'
  await assert.rejects(
    () => loadDashboardContext(fakeEvent(), { orgSlug: 'org-does-not-exist' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 404,
  )
})

test('loadDashboardContext: explicit orgSlug the user is not a member of, with a stale session active org, throws 404 instead of leaking the active org', async () => {
  sessionActiveOrganizationId = 'org-a'
  store.members = store.members.filter((m) => m.organizationId !== 'org-b')
  await assert.rejects(
    () => loadDashboardContext(fakeEvent(), { orgSlug: 'org-b' }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 404,
  )
})

test('loadDashboardContext: explicit, accessible orgSlug resolves to that org even with a different stale session active org', async () => {
  sessionActiveOrganizationId = 'org-a'
  const result = await loadDashboardContext(fakeEvent(), { orgSlug: 'org-b' })
  assert.equal(result.organization?.id, 'org-b')
})

test('loadDashboardContext: no orgSlug (unscoped discovery) is allowed to fall back to the session active org', async () => {
  sessionActiveOrganizationId = 'org-a'
  const result = await loadDashboardContext(fakeEvent())
  assert.equal(result.organization?.id, 'org-a')
})
