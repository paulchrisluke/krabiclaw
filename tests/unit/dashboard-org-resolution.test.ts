import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Behavioral regression coverage for the cross-tenant dashboard/billing leak fixed
// alongside this test: a multi-org user's request must never resolve to a
// different organization than the one named by the x-dashboard-org-slug header
// (or an explicit, membership-checked param), regardless of what Better Auth's
// session-wide activeOrganizationId happens to be set to. This replaces an earlier
// version of this file that only regex-matched dashboard-context.ts's source text —
// that would still pass even with the unsafe fallback left completely intact.

type Row = Record<string, unknown>

interface Store {
  organizations: Row[]
  members: Row[]
  sites: Row[]
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
    sites: [
      { id: 'site-a', organization_id: 'org-a', subdomain: 'site-a', brand_name: 'Site A', vertical: 'restaurant', custom_domain: null, public_url: null, status: 'active', onboarding_status: 'complete', plan: 'free', primary_location_id: null, default_currency: 'usd', source_locale: 'en' },
      { id: 'site-b', organization_id: 'org-b', subdomain: 'site-b', brand_name: 'Site B', vertical: 'restaurant', custom_domain: null, public_url: null, status: 'active', onboarding_status: 'complete', plan: 'free', primary_location_id: null, default_currency: 'usd', source_locale: 'en' },
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
  if (query.includes('FROM sites') && query.includes('subdomain = ?')) {
    const [organizationId, subdomain] = params as [string, string]
    return store.sites.find((s) => s.organization_id === organizationId && s.subdomain === subdomain) as T | undefined
  }
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM sites') && query.includes('WHERE organization_id = ?') && query.includes('LIMIT 2')) {
    const [organizationId] = params as [string]
    return store.sites.filter((s) => s.organization_id === organizationId) as T[]
  }
  if (query.includes('FROM site_config')) return [] as T[]
  throw new Error(`Unexpected queryAll query: ${query}`)
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
  },
})

const { resolveRequestedOrganization, getDashboardContext } = await import('../../server/utils/dashboard-context.ts')

function fakeEvent(headers: Record<string, string> = {}, path = '/api/dashboard/home') {
  return {
    node: { req: { headers } },
    path,
  } as unknown as Parameters<typeof resolveRequestedOrganization>[0]
}

const fakeDb = {} as unknown as Parameters<typeof resolveRequestedOrganization>[1]

test.beforeEach(() => {
  store = createStore()
  sessionActiveOrganizationId = null
})

test('resolveRequestedOrganization: header resolves the org regardless of activeOrganizationId', async () => {
  const org = await resolveRequestedOrganization(fakeEvent({ 'x-dashboard-org-slug': 'org-b' }), fakeDb, 'user-1', {
    activeOrganizationId: 'org-a',
  })
  assert.equal(org?.id, 'org-b')
})

test('resolveRequestedOrganization: no header, no explicit id, no activeOrganizationId passed -> null', async () => {
  const org = await resolveRequestedOrganization(fakeEvent(), fakeDb, 'user-1')
  assert.equal(org, null)
})

test('resolveRequestedOrganization: no header, activeOrganizationId passed -> allowed (requireOrganization:false shape)', async () => {
  const org = await resolveRequestedOrganization(fakeEvent(), fakeDb, 'user-1', { activeOrganizationId: 'org-a' })
  assert.equal(org?.id, 'org-a')
})

test('resolveRequestedOrganization: explicit id conflicting with header -> throws 400 instead of silently picking one', async () => {
  await assert.rejects(
    () => resolveRequestedOrganization(fakeEvent({ 'x-dashboard-org-slug': 'org-a' }), fakeDb, 'user-1', {
      explicitOrganizationId: 'org-b',
    }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  )
})

test('resolveRequestedOrganization: explicit id agreeing with header -> resolves', async () => {
  const org = await resolveRequestedOrganization(fakeEvent({ 'x-dashboard-org-slug': 'org-a' }), fakeDb, 'user-1', {
    explicitOrganizationId: 'org-a',
  })
  assert.equal(org?.id, 'org-a')
})

test('resolveRequestedOrganization: explicit id for an org the user is not a member of -> not resolved', async () => {
  const org = await resolveRequestedOrganization(fakeEvent(), fakeDb, 'user-1', {
    explicitOrganizationId: 'org-does-not-exist',
  })
  assert.ok(!org)
})

test('getDashboardContext: default (URL-scoped) caller with no header and a stale active org -> 400, never silently resolves the stale org', async () => {
  sessionActiveOrganizationId = 'org-a'
  await assert.rejects(
    () => getDashboardContext(fakeEvent(), { requireSite: false }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
  )
})

test('getDashboardContext: header overrides a stale active org — this is the exact reported leak scenario', async () => {
  sessionActiveOrganizationId = 'org-a' // session still "active" on Org A
  const context = await getDashboardContext(
    fakeEvent({ 'x-dashboard-org-slug': 'org-b', 'x-dashboard-site-slug': 'site-b' }),
    { requireSite: false },
  )
  assert.equal(context.organization?.id, 'org-b')
  assert.equal(context.site?.id, 'site-b')
})

test('getDashboardContext: requireOrganization:false with no header falls back to active org (boot-discovery/notifications shape)', async () => {
  sessionActiveOrganizationId = 'org-a'
  const context = await getDashboardContext(fakeEvent(), { requireOrganization: false, requireSite: false })
  assert.equal(context.organization?.id, 'org-a')
})

test('getDashboardContext: requireOrganization:false with no header and no active org -> organization null, does not throw', async () => {
  sessionActiveOrganizationId = null
  const context = await getDashboardContext(fakeEvent(), { requireOrganization: false, requireSite: false })
  assert.equal(context.organization, null)
})

// --- Unrelated pre-existing source-shape checks, kept as-is ---

const dashboardEntrySource = readFileSync(
  new URL('../../pages/dashboard/index.vue', import.meta.url),
  'utf8',
)
const postLoginSource = readFileSync(
  new URL('../../server/api/post-login.get.ts', import.meta.url),
  'utf8',
)
const dashboardLayoutSource = readFileSync(
  new URL('../../layouts/dashboard.vue', import.meta.url),
  'utf8',
)

test('bare dashboard delegates to the server-side authenticated entry router', () => {
  assert.match(dashboardEntrySource, /navigateTo\('\/api\/post-login'/)
  assert.doesNotMatch(dashboardEntrySource, /useDashboardSite\(/)
  assert.doesNotMatch(postLoginSource, /sendRedirect\(event, '\/dashboard'\)/)
})

test('general Content sidebar link opens the site-scoped content page', () => {
  assert.match(dashboardLayoutSource, /label: 'Content', icon: 'i-lucide-copy', to: `\$\{siteBase\.value\}\/content`/)
  assert.doesNotMatch(dashboardLayoutSource, /label: 'Content'[^\n]+content\?page=location/)
})
