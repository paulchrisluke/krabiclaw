import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

// #341 Workstream A: location_manager is retired. editor is always
// constrained through member_access_scope; a site-wide scope row
// (location_id IS NULL) makes an editor a "site manager", a scope row with
// location_id set makes them a "location manager" for that location only.

;(globalThis as unknown as { createError?: (_opts: Record<string, unknown>) => Error }).createError = (opts) =>
  Object.assign(new Error((opts.statusMessage as string) || (opts.message as string) || 'Error'), opts)

type ScopeRow = { id: string; member_id: string; organization_id: string; site_id: string; location_id: string | null }

const scopeRows: ScopeRow[] = [
  { id: 's1', member_id: 'member-loc', organization_id: 'org-1', site_id: 'site-1', location_id: 'loc-1' },
  { id: 's2', member_id: 'member-site', organization_id: 'org-1', site_id: 'site-2', location_id: null },
  { id: 's3', member_id: 'member-multi', organization_id: 'org-1', site_id: 'site-1', location_id: 'loc-1' },
  { id: 's4', member_id: 'member-multi', organization_id: 'org-1', site_id: 'site-1', location_id: 'loc-2' },
]

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('MAX(CASE WHEN location_id IS NULL')) {
    const [memberId, organizationId, siteId] = params
    const rows = scopeRows.filter(r => r.member_id === memberId && r.organization_id === organizationId && r.site_id === siteId)
    return (rows.length ? { site_wide: rows.some(r => r.location_id === null) ? 1 : 0 } : undefined) as T | undefined
  }
  // Most specific first: assertLocationAccess's query contains BOTH
  // "location_id IS NULL" and "location_id = ?" as substrings (it's an OR of
  // the two), so it must be checked before the plain site-wide-only branch.
  if (query.includes('FROM member_access_scope') && query.includes('location_id IS NULL OR location_id = ?')) {
    const [memberId, organizationId, siteId, locationId] = params
    const row = scopeRows.find(r => r.member_id === memberId && r.organization_id === organizationId && r.site_id === siteId && (r.location_id === null || r.location_id === locationId))
    return (row ? { id: row.id } : undefined) as T | undefined
  }
  if (query.includes('FROM member_access_scope') && query.includes('location_id IS NULL')) {
    const [memberId, organizationId, siteId] = params
    const row = scopeRows.find(r => r.member_id === memberId && r.organization_id === organizationId && r.site_id === siteId && r.location_id === null)
    return (row ? { id: row.id } : undefined) as T | undefined
  }
  if (query.includes('FROM member_access_scope') && query.includes('LIMIT 1')) {
    const [memberId, organizationId, siteId] = params
    const row = scopeRows.find(r => r.member_id === memberId && r.organization_id === organizationId && r.site_id === siteId)
    return (row ? { id: row.id } : undefined) as T | undefined
  }
  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM member_access_scope')) {
    const [memberId, siteId] = params
    return scopeRows
      .filter(r => r.member_id === memberId && r.site_id === siteId)
      .map(r => ({ location_id: r.location_id })) as T[]
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
} = await import('../../server/utils/member-access.ts')

test('owner and admin bypass every scope check', async () => {
  assert.equal(isOrganizationWideRole('owner'), true)
  assert.equal(isOrganizationWideRole('admin'), true)
  await assert.doesNotReject(() => assertSiteWideAccess({} as never, { memberId: 'x', role: 'owner', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'x', role: 'admin', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-9' }))
  assert.equal(await listAccessibleLocationIds({} as never, { memberId: 'x', role: 'owner', organizationId: 'org-1', siteId: 'site-1' }), null)
})

test('a site-wide-scoped editor passes site-wide and any location, but a location-only editor does not', async () => {
  await assert.doesNotReject(() => assertSiteWideAccess({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2', locationId: 'loc-anything' }))

  await assert.rejects(() => assertSiteWideAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1' }))
  await assert.doesNotReject(() => assertLocationAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-1' }))
  await assert.rejects(() => assertLocationAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', locationId: 'loc-2' }))
})

test('assertResourceAccess dispatches by the resource\'s own location_id', async () => {
  await assert.rejects(() => assertResourceAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', resourceLocationId: null }))
  await assert.doesNotReject(() => assertResourceAccess({} as never, { memberId: 'member-loc', role: 'editor', organizationId: 'org-1', siteId: 'site-1', resourceLocationId: 'loc-1' }))
})

test('assertSiteContextAccess allows any scope row for the site, including location-only', async () => {
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

test('listAccessibleLocationIds returns null for site-wide scope, an array of ids for a multi-location editor', async () => {
  assert.equal(await listAccessibleLocationIds({} as never, { memberId: 'member-site', role: 'editor', organizationId: 'org-1', siteId: 'site-2' }), null)
  assert.deepEqual(
    (await listAccessibleLocationIds({} as never, { memberId: 'member-multi', role: 'editor', organizationId: 'org-1', siteId: 'site-1' }))?.sort(),
    ['loc-1', 'loc-2'],
  )
})

test('dashboard site access distinguishes organization, site-wide, and location-only principals', async () => {
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
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/locations/loc-1/integrations/google-business'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/locations/loc-1/integrations/google-business/auth'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/locations/loc-1/integrations/google-business/unsafe'), false)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/editor/media'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/ai/generate-image'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/ai/credits'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/onboarding/checklist?siteId=site-1'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/reservations/abc'), false)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/settings'), true)
  assert.equal(canScopedRoleUseDashboardPath('/api/dashboard/members'), false)
})

test('phone invitations reuse the Better Auth deterministic temporary email convention', async () => {
  const { phoneTemporaryEmail } = await import('../../server/utils/phone-invitations.ts')
  assert.equal(phoneTemporaryEmail('+66 81 234 5678'), 'phone-66812345678@phone.krabiclaw.local')
})

test('access invitation payload matches the submitted Meta parameter order', async () => {
  const { buildWhatsAppTemplatePayload } = await import('../../server/utils/whatsapp.ts')
  assert.deepEqual(buildWhatsAppTemplatePayload('dashboard_access_invitation', {
    site_name: 'Pottery House Krabi',
    invitation_path: 'invite-1?siteId=site-pottery-house',
  }), {
    name: 'dashboard_access_invitation',
    language: { code: 'en_US' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: 'Pottery House Krabi' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'invite-1?siteId=site-pottery-house' }] },
    ],
  })
})
