import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

;(globalThis as unknown as { createError?: (_opts: Record<string, unknown>) => Error }).createError = (opts) =>
  Object.assign(new Error((opts.statusMessage as string) || (opts.message as string) || 'Error'), opts)

const siteTeams = new Map([
  ['site-1', 'site:site-1'],
  ['site-2', 'site:site-2'],
])
const locationTeams = new Map([
  ['loc-1', { siteId: 'site-1', teamId: 'location:loc-1' }],
  ['loc-2', { siteId: 'site-1', teamId: 'location:loc-2' }],
])
const members = new Map([
  ['member-loc', { userId: 'user-loc', organizationId: 'org-1' }],
  ['member-site', { userId: 'user-site', organizationId: 'org-1' }],
  ['member-multi', { userId: 'user-multi', organizationId: 'org-1' }],
])
const userTeams = new Map([
  ['user-loc', new Set(['location:loc-1'])],
  ['user-site', new Set(['site:site-2'])],
  ['user-multi', new Set(['location:loc-1', 'location:loc-2'])],
])

const provisionedTeams = new Map<string, { id: string; organizationId: string; name: string }>()
const provisionedMemberships = new Map<string, { id: string; teamId: string; userId: string }>()
const teamAdapterCalls: string[] = []
const teamAdapter = {
  findTeamById: async (input: { teamId: string; organizationId?: string }) => {
    teamAdapterCalls.push(`find:${input.teamId}:${input.organizationId || ''}`)
    const team = provisionedTeams.get(input.teamId)
    return team && (!input.organizationId || team.organizationId === input.organizationId) ? team : null
  },
  createTeam: async (input: { id: string; organizationId: string; name: string }) => {
    teamAdapterCalls.push(`create:${input.id}`)
    const team = { id: input.id, organizationId: input.organizationId, name: input.name }
    provisionedTeams.set(input.id, team)
    return team
  },
  findOrCreateTeamMember: async (input: { teamId: string; userId: string }) => {
    teamAdapterCalls.push(`findOrCreate:${input.teamId}:${input.userId}`)
    const key = `${input.teamId}:${input.userId}`
    const existing = provisionedMemberships.get(key)
    if (existing) return existing
    const member = { id: `membership:${key}`, teamId: input.teamId, userId: input.userId }
    provisionedMemberships.set(key, member)
    return member
  },
  findTeamMember: async (input: { teamId: string; userId: string }) => {
    teamAdapterCalls.push(`findMember:${input.teamId}:${input.userId}`)
    return provisionedMemberships.get(`${input.teamId}:${input.userId}`) ?? null
  },
  removeTeamMember: async (input: { teamId: string; userId: string }) => {
    teamAdapterCalls.push(`remove:${input.teamId}:${input.userId}`)
    provisionedMemberships.delete(`${input.teamId}:${input.userId}`)
  },
  listTeamsByUser: async (input: { userId: string }) => {
    teamAdapterCalls.push(`listTeams:${input.userId}`)
    return [...provisionedMemberships.values()]
      .filter(member => member.userId === input.userId)
      .map(member => provisionedTeams.get(member.teamId))
      .filter((team): team is { id: string; organizationId: string; name: string } => Boolean(team))
      .map(team => ({ ...team, createdAt: new Date() }))
  },
}

function hasSiteTeam(memberId: unknown, siteId: unknown) {
  const member = members.get(String(memberId))
  const teamId = siteTeams.get(String(siteId))
  return Boolean(member && teamId && userTeams.get(member.userId)?.has(teamId))
}

function hasLocationTeam(memberId: unknown, siteId: unknown, locationId: unknown) {
  const member = members.get(String(memberId))
  const siteTeam = siteTeams.get(String(siteId))
  const location = locationTeams.get(String(locationId))
  return Boolean(member && (
    (siteTeam && userTeams.get(member.userId)?.has(siteTeam)) ||
    (location?.siteId === siteId && userTeams.get(member.userId)?.has(location.teamId))
  ))
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('JOIN sites s') && query.includes('tm.teamId = s.team_id')) {
    const [siteId, memberId] = params
    return (hasSiteTeam(memberId, siteId) ? { id: 'team-member-site' } : undefined) as T | undefined
  }
  if (query.includes('business_locations bl') && query.includes('bl.id = ?') && query.includes('tm.teamId IN')) {
    const [siteId, locationId, memberId] = params
    return (hasLocationTeam(memberId, siteId, locationId) ? { id: 'team-member-location' } : undefined) as T | undefined
  }
  if (query.includes('LEFT JOIN business_locations bl') && query.includes('tm.teamId IN')) {
    const [siteId, memberId] = params
    const member = members.get(String(memberId))
    const teams = member ? userTeams.get(member.userId) : null
    const hasAny = Boolean(teams && (
      teams.has(siteTeams.get(String(siteId)) || '') ||
      [...locationTeams.values()].some(location => location.siteId === siteId && teams.has(location.teamId))
    ))
    return (hasAny ? { id: 'team-member-any' } : undefined) as T | undefined
  }
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('SELECT bl.id AS location_id')) {
    const [siteId, memberId] = params
    const member = members.get(String(memberId))
    const teams = member ? userTeams.get(member.userId) : null
    if (!teams) return []
    return [...locationTeams.entries()]
      .filter(([, location]) => location.siteId === siteId && teams.has(location.teamId))
      .map(([locationId]) => ({ location_id: locationId })) as T[]
  }
  throw new Error(`Unexpected queryAll query: ${query}`)
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst,
    queryAll,
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => [],
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({ $context: Promise.resolve({}) }),
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => teamAdapter,
  },
})

const {
  isOrganizationWideRole,
  isScopedRole,
  isOperationalRole,
  assertOrganizationAccess,
  assertSiteWideAccess,
  assertLocationAccess,
  assertResourceAccess,
  assertSiteContextAccess,
  listAccessibleLocationIds,
  resolveDashboardSiteAccess,
  canScopedRoleUseDashboardPath,
  teamAccessPredicate,
  ensureSiteTeam,
  ensureLocationTeam,
  addUserToResourceTeam,
  removeUserFromResourceTeam,
  removeAllMemberResourceAccess,
} = await import('../../server/utils/member-access.ts')

test('owner and admin bypass every team check', async () => {
  assert.equal(isOrganizationWideRole('owner'), true)
  assert.equal(isOrganizationWideRole('admin'), true)
  await assert.doesNotReject(() => assertSiteWideAccess({} as never, { memberId: 'x', role: 'owner', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'x', role: 'admin', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-9' }))
  assert.equal(await listAccessibleLocationIds({} as never, { memberId: 'x', role: 'owner', organizationId: 'org-1', siteId: 'site-1' }), null)
})

test('a site-team editor passes site-wide and any location, but a location-only editor does not', async () => {
  await assert.doesNotReject(() => assertSiteWideAccess({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2', locationId: 'loc-anything' }))

  await assert.rejects(() => assertSiteWideAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' }))
  await assert.rejects(() => assertLocationAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-2' }))
})

test('assertResourceAccess dispatches by the resource location', async () => {
  await assert.rejects(() => assertResourceAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', resourceLocationId: null }))
  await assert.doesNotReject(() => assertResourceAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', resourceLocationId: 'loc-1' }))
})

test('assertSiteContextAccess allows any team membership for the site', async () => {
  await assert.doesNotReject(() => assertSiteContextAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.rejects(() => assertSiteContextAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-2' }))
})

test('an unrelated non-scoped role never passes any check', async () => {
  assert.equal(isScopedRole('member'), false)
  assert.equal(isOperationalRole('member'), false)
  await assert.rejects(() => assertSiteWideAccess({} as never, { memberId: 'x', role: 'member', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.rejects(() => listAccessibleLocationIds({} as never, { memberId: 'x', role: 'member', organizationId: 'org-1', siteId: 'site-1' }))
  assert.throws(() => assertOrganizationAccess('member'))
})

test('listAccessibleLocationIds returns null for site team, and ids for location teams', async () => {
  assert.equal(await listAccessibleLocationIds({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2' }), null)
  assert.deepEqual(
    (await listAccessibleLocationIds({} as never, { memberId: 'member-multi', role: 'editor', organizationId: 'org-1', siteId: 'site-1' }))?.sort(),
    ['loc-1', 'loc-2'],
  )
})

test('dashboard site access distinguishes organization, site-team, and location-only principals', async () => {
  assert.equal(await resolveDashboardSiteAccess({} as never, {
    memberId: 'owner', role: 'owner', organizationId: 'org-1', siteId: 'site-1',
  }), 'organization')
  assert.equal(await resolveDashboardSiteAccess({} as never, {
    memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2',
  }), 'site')
  assert.equal(await resolveDashboardSiteAccess({} as never, {
    memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1',
  }), 'location')
})

test('the audited /api/dashboard/** boundary is deny-by-default for scoped roles', () => {
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/context'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/locations/loc-1'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/locations/loc-1/integrations/google-business'), false)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/editor/media'), false)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/sites/site-1/guest-threads'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/sites/site-1/guest-threads/thread-1/reply'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/onboarding/checklist?siteId=site-1'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/members'), false)
})

// #406: teamAccessPredicate is the shared EXISTS-clause builder extracted out
// of dashboard-home.ts, chowbot-conversations.ts, and whatsapp/webhook.post.ts,
// which each independently wrote this same team-membership check for their
// own bulk row-filtering queries before this consolidation.
test('teamAccessPredicate builds a site-only EXISTS clause when no location expression is given', () => {
  assert.equal(
    teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id' }),
    'EXISTS (SELECT 1 FROM teamMember tm WHERE tm.userId = m.userId AND tm.teamId = s.team_id)',
  )
})

test('teamAccessPredicate builds a site-or-location EXISTS clause when a location expression is given', () => {
  assert.equal(
    teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id', locationTeamExpr: 'bl.team_id' }),
    'EXISTS (SELECT 1 FROM teamMember tm WHERE tm.userId = m.userId AND tm.teamId IN (s.team_id, bl.team_id))',
  )
})

test('teamAccessPredicate treats an explicit null locationTeamExpr the same as omitting it', () => {
  assert.equal(
    teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id', locationTeamExpr: null }),
    teamAccessPredicate({ userIdExpr: 'm.userId', siteTeamExpr: 's.team_id' }),
  )
})

test('resource team provisioning uses Better Auth Teams with deterministic scoped ids and idempotency', async () => {
  provisionedTeams.clear()
  provisionedMemberships.clear()
  teamAdapterCalls.length = 0

  const env = {} as never
  assert.equal(await ensureSiteTeam({} as never, {
    env,
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'Main site',
  }), 'site:site-1')
  assert.equal(await ensureSiteTeam({} as never, {
    env,
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'Main site',
  }), 'site:site-1')
  assert.equal(await ensureLocationTeam({} as never, {
    env,
    organizationId: 'org-1',
    siteId: 'site-1',
    locationId: 'location-1',
    name: 'Beach',
  }), 'location:location-1')

  assert.deepEqual([...provisionedTeams.values()], [
    { id: 'site:site-1', organizationId: 'org-1', name: 'Main site' },
    { id: 'location:location-1', organizationId: 'org-1', name: 'Beach' },
  ])
  assert.equal(teamAdapterCalls.filter(call => call === 'create:site:site-1').length, 1)
  assert.equal(teamAdapterCalls.filter(call => call === 'create:location:location-1').length, 1)
})

test('resource team membership add/remove is idempotent through Better Auth Teams', async () => {
  provisionedMemberships.clear()
  teamAdapterCalls.length = 0
  const env = {} as never

  await addUserToResourceTeam({} as never, { env, teamId: 'site:site-1', userId: 'user-1' })
  await addUserToResourceTeam({} as never, { env, teamId: 'site:site-1', userId: 'user-1' })
  assert.equal(provisionedMemberships.size, 1)
  assert.equal(teamAdapterCalls.filter(call => call === 'findOrCreate:site:site-1:user-1').length, 2)

  assert.equal(await removeUserFromResourceTeam({} as never, { env, teamId: 'site:site-1', userId: 'user-1' }), true)
  assert.equal(await removeUserFromResourceTeam({} as never, { env, teamId: 'site:site-1', userId: 'user-1' }), false)
  assert.equal(provisionedMemberships.size, 0)
})

test('bulk resource access removal only revokes matching-organization teams and is idempotent', async () => {
  provisionedTeams.clear()
  provisionedMemberships.clear()
  teamAdapterCalls.length = 0
  provisionedTeams.set('site:org-one', { id: 'site:org-one', organizationId: 'org-1', name: 'Org one' })
  provisionedTeams.set('site:org-two', { id: 'site:org-two', organizationId: 'org-2', name: 'Org two' })

  const env = {} as never
  await addUserToResourceTeam({} as never, { env, teamId: 'site:org-one', userId: 'user-shared' })
  await addUserToResourceTeam({} as never, { env, teamId: 'site:org-two', userId: 'user-shared' })

  await removeAllMemberResourceAccess({} as never, { env, organizationId: 'org-1', userId: 'user-shared' })
  assert.equal(provisionedMemberships.has('site:org-one:user-shared'), false)
  assert.equal(provisionedMemberships.has('site:org-two:user-shared'), true)

  await assert.doesNotReject(() => removeAllMemberResourceAccess({} as never, {
    env,
    organizationId: 'org-1',
    userId: 'user-shared',
  }))
  await removeAllMemberResourceAccess({} as never, { env, organizationId: 'org-no-match', userId: 'user-shared' })
  assert.equal(provisionedMemberships.has('site:org-two:user-shared'), true)
})

test('resource team provisioning rejects a deterministic id owned by another organization', async () => {
  provisionedTeams.clear()
  teamAdapterCalls.length = 0
  provisionedTeams.set('site:site-1', { id: 'site:site-1', organizationId: 'org-other', name: 'Other' })

  await assert.rejects(
    () => ensureSiteTeam({} as never, {
      env: {} as never,
      organizationId: 'org-1',
      siteId: 'site-1',
    }),
    /belongs to another organization/,
  )
  assert.equal(teamAdapterCalls.some(call => call === 'create:site:site-1'), false)
})
