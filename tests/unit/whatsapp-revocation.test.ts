import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Fake in-memory relational store standing in for D1, mocked into
// server/db/index.ts's execute/queryAll/queryFirst exports (same pattern as
// tests/unit/guest-claims.test.ts) so server/utils/whatsapp-revocation.ts can
// be exercised without a real Cloudflare D1 binding.
//
// `createError` is a Nitro/H3 auto-import that isn't available outside a
// Nuxt server context — server/utils/member-access.ts already relies on it
// being ambient the same way. Only clearOrReassignAssignments's 'reassign'
// branch calls it, so a minimal polyfill covers that one test case.
;(globalThis as unknown as { createError?: (_opts: Record<string, unknown>) => Error }).createError = (opts) =>
  Object.assign(new Error((opts.statusMessage as string) || (opts.message as string) || 'Error'), opts)

type Row = Record<string, unknown>

type Store = {
  members: Row[]
  users: Row[]
  resourceTeams: Row[]
  locations: Row[]
  siteConfig: Row[]
}

function createStore(): Store {
  return { members: [], users: [], resourceTeams: [], locations: [], siteConfig: [] }
}

async function queryFirst<T>(db: Store, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('SELECT id, organizationId, role, userId FROM member')) {
    const [id] = params
    return db.members.find((m) => m.id === id) as T | undefined
  }
  if (query.includes('SELECT userId, organizationId FROM member WHERE id')) {
    const [id] = params
    const member = db.members.find((m) => m.id === id)
    return (member ? { userId: member.userId, organizationId: member.organizationId } : undefined) as T | undefined
  }
  if (query.includes('FROM user u') && query.includes('JOIN member m')) {
    const [organizationId, phone] = params
    const user = db.users.find((u) => u.phoneNumber === phone && u.phoneNumberVerified === 1)
    if (!user) return undefined
    const member = db.members.find((m) => m.userId === user.id && m.organizationId === organizationId)
    return (member ? { memberId: member.id, role: member.role, userId: member.userId } : undefined) as T | undefined
  }
  if (query.includes('FROM user WHERE id')) {
    const [id] = params
    const user = db.users.find((u) => u.id === id)
    return (user ? { phoneNumber: user.phoneNumber ?? null, phoneNumberVerified: user.phoneNumberVerified ?? 0 } : undefined) as T | undefined
  }
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(db: Store, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('JOIN teamMember tm') && query.includes('WHERE m.id = ?')) {
    const [memberId] = params
    const member = db.members.find((m) => m.id === memberId)
    if (!member) return []
    return db.resourceTeams
      .filter((s) => s.userId === member.userId)
      .map((s) => ({ organizationId: s.organizationId, siteId: s.siteId, locationId: s.locationId ?? null })) as T[]
  }
  if (query.includes('FROM business_locations bl')) {
    const [phone, organizationId] = params
    return db.locations
      .filter((l) => l.notification_phone === phone && l.organization_id === organizationId)
      .map((l) => ({
        organizationId: l.organization_id,
        siteId: l.site_id,
        siteName: l.site_name ?? 'Test Site',
        locationId: l.id,
        locationName: l.title,
      })) as T[]
  }
  if (query.includes('FROM site_config sc')) {
    const [phone, organizationId] = params
    return db.siteConfig
      .filter((c) => c.key === 'whatsapp_phone' && c.value === phone && c.organization_id === organizationId)
      .map((c) => ({ organizationId: c.organization_id, siteId: c.site_id, siteName: c.site_name ?? 'Test Site' })) as T[]
  }
  throw new Error(`Unexpected queryAll query: ${query}`)
}

async function execute(db: Store, query: string, params: unknown[] = []) {
  if (query.includes('DELETE FROM teamMember')) {
    const [teamId, userId] = params
    const before = db.resourceTeams.length
    db.resourceTeams = db.resourceTeams.filter((s) => !(s.teamId === teamId && s.userId === userId))
    return { meta: { changes: before - db.resourceTeams.length } }
  }
  if (query.includes('DELETE FROM member WHERE id')) {
    const [id] = params
    const before = db.members.length
    db.members = db.members.filter((m) => m.id !== id)
    return { meta: { changes: before - db.members.length } }
  }
  if (query.includes('UPDATE business_locations SET notification_phone = NULL')) {
    const [, id] = params
    const location = db.locations.find((l) => l.id === id)
    if (location) location.notification_phone = null
    return { meta: { changes: location ? 1 : 0 } }
  }
  if (query.includes(`DELETE FROM site_config WHERE organization_id = ? AND site_id = ? AND key = 'whatsapp_phone'`)) {
    const [organizationId, siteId] = params
    const before = db.siteConfig.length
    db.siteConfig = db.siteConfig.filter((c) => !(c.organization_id === organizationId && c.site_id === siteId && c.key === 'whatsapp_phone'))
    return { meta: { changes: before - db.siteConfig.length } }
  }
  // Anything else (e.g. `INSERT INTO site_events`) is swallowed by
  // fireSiteEventSafe's own try/catch, so an "unexpected query" throw here is
  // fine — it never surfaces as a test failure.
  throw new Error(`Unexpected execute query: ${query}`)
}

async function executeBatch(db: Store, statements: Array<{ query: string; params?: unknown[] }>) {
  return await Promise.all(statements.map(({ query, params }) => execute(db, query, params)))
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

// site-events.ts pulls in dashboard-context.ts -> auth.ts (Better Auth setup,
// H3 auto-imports) purely for resolvePrimarySiteForEvent's org->site lookup,
// none of which is available/needed outside a Nuxt server context for these
// tests. Stub both functions to no-ops — whatsapp-revocation.ts only uses
// them for best-effort audit logging (fireSiteEventSafe already swallows its
// own errors), never for control flow, so this doesn't hide any real behavior.
mock.module('../../server/utils/site-events.ts', {
  namedExports: {
    fireSiteEventSafe: async () => {},
    fireSiteEvent: async () => {},
    resolvePrimarySiteForEvent: async () => null,
  },
})

const {
  clearOrReassignAssignments,
  findAssignmentsForMemberPhone,
  recalculateScopesForPhoneChange,
  removeOrgMembershipIfNoScopesRemain,
} = await import('../../server/utils/whatsapp-revocation.ts')

const SCOPED_EDITOR_ROLE = 'editor'

function seedManager(db: Store, overrides: { memberId?: string; userId?: string; phone?: string; role?: string } = {}) {
  const memberId = overrides.memberId ?? 'member-1'
  const userId = overrides.userId ?? 'user-1'
  const phone = overrides.phone ?? '+66812345678'
  db.members.push({ id: memberId, organizationId: 'org-1', userId, role: overrides.role ?? SCOPED_EDITOR_ROLE })
  db.users.push({ id: userId, phoneNumber: phone, phoneNumberVerified: 1 })
  return { memberId, userId, phone }
}

test('recalculateScopesForPhoneChange removes only the scope row for the exact site/location', async () => {
  const db = createStore()
  const { userId, phone } = seedManager(db)
  db.resourceTeams.push(
    { id: 'team-a', userId, teamId: 'location:loc-1', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' },
    { id: 'team-b', userId, teamId: 'site:site-2', organizationId: 'org-1', siteId: 'site-2', locationId: null },
  )

  const result = await recalculateScopesForPhoneChange(db as never, null, {
    organizationId: 'org-1',
    siteId: 'site-1',
    locationId: 'loc-1',
    scopeType: 'location',
    previousPhone: phone,
    newPhone: null,
  })

  assert.equal(result.scopeRemoved, true)
  assert.deepEqual(db.resourceTeams.map((s) => s.id), ['team-b'])
  assert.equal(result.memberRemoved, false)
  assert.equal(db.members.length, 1)
})

test('recalculateScopesForPhoneChange is idempotent when the phone did not change', async () => {
  const db = createStore()
  const { userId, phone } = seedManager(db)
  db.resourceTeams.push({ id: 'team-a', userId, teamId: 'location:loc-1', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' })

  const unchanged = await recalculateScopesForPhoneChange(db as never, null, {
    organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1', scopeType: 'location', previousPhone: phone, newPhone: phone,
  })
  const noPrevious = await recalculateScopesForPhoneChange(db as never, null, {
    organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1', scopeType: 'location', previousPhone: null, newPhone: phone,
  })

  assert.deepEqual(unchanged, { scopeRemoved: false, memberRemoved: false })
  assert.deepEqual(noPrevious, { scopeRemoved: false, memberRemoved: false })
  assert.equal(db.resourceTeams.length, 1)
})

test('recalculateScopesForPhoneChange never touches organization-wide roles', async () => {
  const db = createStore()
  const { userId, phone } = seedManager(db, { role: 'admin' })
  db.resourceTeams.push({ id: 'team-a', userId, teamId: 'location:loc-1', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' })

  const result = await recalculateScopesForPhoneChange(db as never, null, {
    organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1', scopeType: 'location', previousPhone: phone, newPhone: null,
  })

  assert.equal(result.scopeRemoved, false)
  assert.equal(db.resourceTeams.length, 1)
})

test('recalculateScopesForPhoneChange removes the exact resource team membership', async () => {
  const db = createStore()
  const { userId, phone } = seedManager(db)
  db.resourceTeams.push({
    id: 'team-location',
    userId,
    teamId: 'location:loc-1',
    organization_id: 'org-1',
    organizationId: 'org-1',
    siteId: 'site-1',
    locationId: 'loc-1',
  })

  const result = await recalculateScopesForPhoneChange(db as never, null, {
    organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1', scopeType: 'location', previousPhone: phone, newPhone: null,
  })

  assert.equal(result.scopeRemoved, true)
  assert.deepEqual(db.resourceTeams, [])
  assert.equal(db.members.length, 0)
})

test('removeOrgMembershipIfNoScopesRemain removes a scope-less editor directly when no actor headers are available', async () => {
  const db = createStore()
  const { memberId } = seedManager(db)

  const result = await removeOrgMembershipIfNoScopesRemain(db as never, null, memberId)

  assert.equal(result.removed, true)
  assert.equal(db.members.length, 0)
})

test('removeOrgMembershipIfNoScopesRemain leaves a member with remaining scopes untouched', async () => {
  const db = createStore()
  const { memberId, userId } = seedManager(db)
  db.resourceTeams.push({ id: 'team-a', userId, teamId: 'site:site-1', organizationId: 'org-1', siteId: 'site-1', locationId: null })

  const result = await removeOrgMembershipIfNoScopesRemain(db as never, null, memberId)

  assert.equal(result.removed, false)
  assert.equal(db.members.length, 1)
})

test('removeOrgMembershipIfNoScopesRemain never removes owner/admin, but does remove a scope-less editor', async () => {
  const db = createStore()
  for (const role of ['owner', 'admin']) {
    const { memberId } = seedManager(db, { memberId: `member-${role}`, userId: `user-${role}`, phone: `+6681000000${role.length}`, role })
    const result = await removeOrgMembershipIfNoScopesRemain(db as never, null, memberId)
    assert.equal(result.removed, false, `${role} must not be auto-removed`)
  }
  // An editor with zero remaining resource teams has no tenant surface access
  // and is the correct case to remove.
  const { memberId: editorMemberId } = seedManager(db, { memberId: 'member-editor', userId: 'user-editor', phone: '+66810000006', role: 'editor' })
  const editorResult = await removeOrgMembershipIfNoScopesRemain(db as never, null, editorMemberId)
  assert.equal(editorResult.removed, true, 'a scope-less editor should be removed')

  assert.equal(db.members.length, 2)
})

test('removeOrgMembershipIfNoScopesRemain prefers the Better Auth API when actor headers are available', async () => {
  const db = createStore()
  const { memberId } = seedManager(db)
  let payload: { memberIdOrEmail: string; organizationId: string } | null = null
  const fakeAuth = {
    api: {
      removeMember: async (input: { body: { memberIdOrEmail: string; organizationId: string } }) => {
        payload = input.body
        return new Response(null, { status: 200 })
      },
    },
  }

  const result = await removeOrgMembershipIfNoScopesRemain(db as never, fakeAuth as never, memberId, { actorHeaders: { Cookie: 'session=x' } })

  assert.deepEqual(payload, { memberIdOrEmail: memberId, organizationId: 'org-1' })
  assert.equal(result.removed, true)
  // The API path succeeded, so the direct-SQL fallback must not have run —
  // the mock store (which the fake API call never touches) still has the row.
  assert.equal(db.members.length, 1)
})

test('findAssignmentsForMemberPhone finds both location- and site-level matches, and nothing for an unverified/missing phone', async () => {
  const db = createStore()
  const { memberId, phone } = seedManager(db)
  db.locations.push({ id: 'loc-1', organization_id: 'org-1', site_id: 'site-1', title: 'Krabi Branch', notification_phone: phone })
  db.locations.push({ id: 'loc-2', organization_id: 'org-1', site_id: 'site-1', title: 'Other Branch', notification_phone: '+66899999999' })
  db.siteConfig.push({ organization_id: 'org-1', site_id: 'site-2', key: 'whatsapp_phone', value: phone })

  const assignments = await findAssignmentsForMemberPhone(db as never, memberId)

  assert.equal(assignments.length, 2)
  assert.ok(assignments.some((a) => a.kind === 'location' && a.locationId === 'loc-1'))
  assert.ok(assignments.some((a) => a.kind === 'site' && a.siteId === 'site-2'))

  const { memberId: unverifiedId } = seedManager(db, { memberId: 'member-2', userId: 'user-2', phone: '+66800000001' })
  db.users.find((u) => u.id === 'user-2')!.phoneNumberVerified = 0
  assert.deepEqual(await findAssignmentsForMemberPhone(db as never, unverifiedId), [])
})

test('clearOrReassignAssignments clears matched location and site config rows', async () => {
  const db = createStore()
  const { memberId, phone } = seedManager(db)
  db.locations.push({ id: 'loc-1', organization_id: 'org-1', site_id: 'site-1', title: 'Krabi Branch', notification_phone: phone })
  db.siteConfig.push({ organization_id: 'org-1', site_id: 'site-2', key: 'whatsapp_phone', value: phone })

  const result = await clearOrReassignAssignments(db as never, memberId, { action: 'clear' })

  assert.equal(result.cleared.length, 2)
  assert.equal(db.locations[0]!.notification_phone, null)
  assert.equal(db.siteConfig.length, 0)
})

test('clearOrReassignAssignments treats "reassign" as an explicit follow-up, not a silent no-op', async () => {
  const db = createStore()
  const { memberId, phone } = seedManager(db)
  db.locations.push({ id: 'loc-1', organization_id: 'org-1', site_id: 'site-1', title: 'Krabi Branch', notification_phone: phone })

  await assert.rejects(
    () => clearOrReassignAssignments(db as never, memberId, { action: 'reassign', targetMemberId: 'member-2' }),
    /not implemented/,
  )
})
