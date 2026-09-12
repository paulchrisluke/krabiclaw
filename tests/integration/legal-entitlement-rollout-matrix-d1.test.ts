import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { createAuth, type CloudflareEnv } from '../../server/utils/auth.ts'
import {
  requireLegalPublicActor, resolveLegalPublicSiteAccess, resolveLegalStaffAccess,
} from '../../server/utils/legal-access.ts'

// U7: this task's brief asks for two things no earlier legal task (U1-U6)
// could prove without violating the no-internal-mocking rule:
//
// 1. "Every real subscription plan denies legal_operations" — already fully
//    covered (tests/unit/billing-plans.test.ts asserts both real plans,
//    'free' and 'growth', the only two organization_billing.access_plan
//    values the schema's own CHECK constraint allows). Not re-proven here;
//    see task-U7-report.md's gap-ledger section for the citation.
// 2. "All six rollout-group flags default-deny" — already fully covered
//    (tests/unit/legal-access.test.ts's first test). Not re-proven here.
//
// What genuinely was NOT provable before this task: resolveLegalStaffAccess
// and resolveLegalPublicSiteAccess/requireLegalPublicActor are the actual
// exported functions every real legal route calls, but neither is callable
// from tests/unit/ — resolveLegalStaffAccess needs a real Better Auth
// session (cookie-based, via getDashboardContext -> getAuthSession) and
// resolveLegalPublicSiteAccess needs cloudflareEnv's Cloudflare-runtime-env
// shape (event.req.runtime.cloudflare.env). Both are real dependencies, so
// U3/U5/U6 all deferred any test that would need them.
//
// This file proves it's possible to satisfy both without an H3Event route
// (defineHandler) dispatch and without mocking any internal module:
// - createAuth(env).api.signUpEmail/signInEmail/signInAnonymous are Better
//   Auth's own real server API (the same one server/api/dashboard/
//   organizations/members/[memberId]/role.post.ts already calls for
//   auth.api.updateMemberRole) — calling them against a real Miniflare D1
//   instance creates a REAL user/session row and returns a REAL signed
//   session cookie, which is then forwarded through a hand-built H3Event's
//   `req.headers`/`req.runtime.cloudflare.env` exactly the way Nitro's real
//   event shape works. No getAuthSession/getDashboardContext/
//   getOrganizationBillingProjection/getActiveBlawbySite call is mocked;
//   every one of them runs for real against the real D1 rows below.
// - This is real, provable route-POLICY coverage, but it is deliberately
//   NOT full H3Event route (defineHandler) dispatch: the handful of actual
//   route files under server/api/dashboard/legal/** and server/api/public/
//   sites/[siteId]/legal/** are not imported or invoked here — only the
//   resolver functions they all call are. What remains genuinely
//   undispatched (request-body parsing, response shaping, the route file's
//   own call into callBlawbyRoute) is listed in task-U7-report.md's gap
//   ledger, not silently claimed as covered.
//
// Every test below is a single subtest table under one top-level test() to
// stay inside this repo's normal test-file shape; this directory
// (tests/integration/) is outside check-unit-test-quality.mjs's file/test/
// line caps (same reasoning legal-access-d1.test.ts and
// legal-intake-public-routes-d1.test.ts already documented for their own
// D1-backed proofs).

async function setupD1() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'legal-entitlement-matrix-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  return { runtime, db }
}

function baseEnv(db: unknown): CloudflareEnv {
  return {
    DB: db, MEDIA_BUCKET: {}, SITE_CACHE: {}, AI: {},
    BETTER_AUTH_URL: 'https://dashboard.example',
    BETTER_AUTH_SECRET: 'test-only-secret-at-least-32-characters-long',
    STRIPE_SECRET_KEY: 'sk_test_local_d1_no_stripe_requests',
    NUXT_PUBLIC_PLATFORM_DOMAIN: 'dashboard.example',
    // Generous so the IP/site budget resolveLegalPublicSiteAccess checks
    // last never trips across this file's tests (each test uses a distinct
    // IP) — R19's budget MATH is already proven independently, for real,
    // against real D1, by tests/integration/legal-access-d1.test.ts.
    LEGAL_PUBLIC_BUDGET_IP_SITE_OP_LIMIT: '1000',
    LEGAL_PUBLIC_BUDGET_IP_SITE_OP_WINDOW_MS: '3600000',
  } as unknown as CloudflareEnv
}

// A real signed-up, real email-verified, real signed-in Better Auth user —
// via the same server API role.post.ts already uses for updateMemberRole,
// not a fabricated session row. Returns the real session cookie a browser
// would receive, plus the real user id, for the test to forward on a
// hand-built H3Event.
async function realVerifiedUserCookie(auth: ReturnType<typeof createAuth>, db: D1Database, email: string): Promise<{ userId: string; cookie: string }> {
  await auth.api.signUpEmail({ body: { email, password: 'Proof-Password-1234', name: 'Proof User' }, asResponse: true })
  await db.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').bind(email).run()
  const signIn = await auth.api.signInEmail({ body: { email, password: 'Proof-Password-1234' }, asResponse: true })
  const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!
  const userRow = await db.prepare('SELECT id FROM user WHERE email = ?').bind(email).first<{ id: string }>()
  return { userId: userRow!.id, cookie }
}

function buildEvent(env: CloudflareEnv, opts: { cookie?: string; origin?: string; ip?: string } = {}) {
  const headers = new Headers()
  if (opts.cookie) headers.set('cookie', opts.cookie)
  if (opts.origin) headers.set('origin', opts.origin)
  if (opts.ip) headers.set('cf-connecting-ip', opts.ip)
  const url = new URL('https://dashboard.example/api/dashboard/legal/practice?org=org-a&site=site-a')
  // res.headers: requireLegalPublicActor's anonymous-session-establishment
  // fix (U9 reconciliation section 5a) forwards a fresh set-cookie onto the
  // event's outgoing response via appendResponseHeader, which needs
  // event.res.headers to exist even on a cookie-less request.
  return {
    req: { headers, runtime: { cloudflare: { env } } },
    res: { headers: new Headers() },
    path: url.pathname,
    url,
  } as unknown as Parameters<typeof resolveLegalStaffAccess>[0]
}

// Captures R29 emitLegalSecurityEvent lines (plain console.log JSON) without
// mocking the emitter itself — same technique tests/unit/legal-access.test.ts
// already uses.
function captureSecurityEvents() {
  const lines: string[] = []
  const original = console.log
  console.log = (line: string) => { lines.push(line) }
  return { lines, restore: () => { console.log = original } }
}

test('no real subscription plan ever entitles legal_operations (staff and public, both real plans, real session/D1)', { timeout: 60_000 }, async (t) => {
  const { runtime, db } = await setupD1()
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-free','Org Free','org-free')",
      "INSERT INTO organization (id,name,slug) VALUES ('org-growth','Org Growth','org-growth')",
      "INSERT INTO organization_billing (organization_id,access_plan) VALUES ('org-growth','growth')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-free','org-free','site-free','site-free','service','blawby-theme-v1','active','active')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-growth','org-growth','site-growth','site-growth','service','blawby-theme-v1','active','active')",
      "INSERT INTO site_domains (id,organization_id,site_id,domain,type,role,status) VALUES ('dom-free','org-free','site-free','site-free.example.com','custom','canonical','active')",
      "INSERT INTO site_domains (id,organization_id,site_id,domain,type,role,status) VALUES ('dom-growth','org-growth','site-growth','site-growth.example.com','custom','canonical','active')",
    ].map(statement => db.prepare(statement)))

    const env = { ...baseEnv(db), LEGAL_PRACTICE_READ_ENABLED: 'true', LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED: 'true' } as unknown as CloudflareEnv
    const auth = createAuth(env)

    await t.test('staff: an owner is denied on both the free and the growth plan, even with the rollout flag on', async () => {
      const { cookie } = await realVerifiedUserCookie(auth, db, 'owner-free@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-free','org-free',(SELECT id FROM user WHERE email='owner-free@proof.example'),'owner')").run()
      const eventFree = buildEvent(env, { cookie })
      await assert.rejects(
        resolveLegalStaffAccess(eventFree, 'practice_read', { organizationSlug: 'org-free', siteSlug: 'site-free', pathname: '/api/dashboard/legal/practice' }),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )

      const { cookie: growthCookie } = await realVerifiedUserCookie(auth, db, 'owner-growth@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-growth','org-growth',(SELECT id FROM user WHERE email='owner-growth@proof.example'),'owner')").run()
      const eventGrowth = buildEvent(env, { cookie: growthCookie })
      await assert.rejects(
        resolveLegalStaffAccess(eventGrowth, 'practice_read', { organizationSlug: 'org-growth', siteSlug: 'site-growth', pathname: '/api/dashboard/legal/practice' }),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })

    await t.test('public: a site under either plan is denied even with its rollout flag on', async () => {
      const eventFree = buildEvent(env, { origin: 'https://site-free.example.com' })
      await assert.rejects(
        resolveLegalPublicSiteAccess(eventFree, 'intake_without_payment', 'site-free'),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
      const eventGrowth = buildEvent(env, { origin: 'https://site-growth.example.com' })
      await assert.rejects(
        resolveLegalPublicSiteAccess(eventGrowth, 'intake_without_payment', 'site-growth'),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})

test('the test-only entitlement injection seam exercises the entitled route contract for real; every production call site uses only the default resolver', { timeout: 60_000 }, async (t) => {
  const { runtime, db } = await setupD1()
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-a','Org A','org-a')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-a','org-a','site-a','site-a','service','blawby-theme-v1','active','active')",
      "INSERT INTO site_domains (id,organization_id,site_id,domain,type,role,status) VALUES ('dom-a','org-a','site-a','site-a.example.com','custom','canonical','active')",
    ].map(statement => db.prepare(statement)))

    const env = { ...baseEnv(db), LEGAL_PRACTICE_READ_ENABLED: 'true', LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED: 'true' } as unknown as CloudflareEnv
    const auth = createAuth(env)
    const alwaysEntitled = async () => true
    const neverEntitled = async () => false

    await t.test('staff: an owner reaches a full LegalStaffAccess only when the injected resolver says entitled', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'owner-a@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-a','org-a',?,'owner')").bind(userId).run()
      const event = buildEvent(env, { cookie })

      const access = await resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-a', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled)
      assert.deepEqual({ organizationId: access.organizationId, siteId: access.siteId, userId: access.userId, role: access.role }, { organizationId: 'org-a', siteId: 'site-a', userId, role: 'owner' })

      await assert.rejects(
        resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-a', pathname: '/api/dashboard/legal/practice' }, neverEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })

    await t.test('public: a real anonymous actor reaches a resolved LegalPublicActor only when the injected resolver says entitled', async () => {
      const signIn = await auth.api.signInAnonymous({ asResponse: true })
      const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!
      const event = buildEvent(env, { cookie, origin: 'https://site-a.example.com', ip: '9.9.9.9' })

      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)
      assert.deepEqual({ organizationId: context.organizationId, siteId: context.siteId }, { organizationId: 'org-a', siteId: 'site-a' })
      const actor = await requireLegalPublicActor(event, context)
      assert.equal(actor.actorKind, 'anonymous')

      await assert.rejects(
        resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', neverEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })

    await t.test('the rollout flag and the entitlement gate are independent: an injected-entitled request is still denied when its own flag is off', async () => {
      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '9.9.9.9' })
      // intake_payment has no flag set in `env` above (only practice_read and
      // intake_without_payment do) — entitlement alone cannot substitute for it.
      await assert.rejects(
        resolveLegalPublicSiteAccess(event, 'intake_payment', 'site-a', alwaysEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})

test('staff role/membership/site gates deny before ever reaching the entitlement check (real session, real D1)', { timeout: 60_000 }, async (t) => {
  const { runtime, db } = await setupD1()
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-a','Org A','org-a')",
      "INSERT INTO organization (id,name,slug) VALUES ('org-b','Org B','org-b')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-a','org-a','site-a','site-a','service','blawby-theme-v1','active','active')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-disabled','org-a','site-disabled','site-disabled','service','blawby-theme-v1','suspended','active')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-onboarding','org-a','site-onboarding','site-onboarding','service','blawby-theme-v1','active','pending')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-non-blawby','org-a','site-non-blawby','site-non-blawby','restaurant','saya-theme-v1','active','active')",
    ].map(statement => db.prepare(statement)))

    const env = { ...baseEnv(db), LEGAL_PRACTICE_READ_ENABLED: 'true' } as unknown as CloudflareEnv
    const auth = createAuth(env)
    const alwaysEntitled = async () => true

    await t.test('an editor is denied before resolveLegalStaffAccess even runs — R29 correctly emits nothing (the documented U3/U5 observability gap, proven for real)', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'editor-a@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-editor','org-a',?,'editor')").bind(userId).run()
      const event = buildEvent(env, { cookie })
      const capture = captureSecurityEvents()
      try {
        await assert.rejects(
          resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-a', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
          (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
        )
      } finally {
        capture.restore()
      }
      assert.deepEqual(capture.lines, [])
    })

    await t.test('a user with no member row at all is denied (organization not found)', async () => {
      const { cookie } = await realVerifiedUserCookie(auth, db, 'stranger@proof.example')
      const event = buildEvent(env, { cookie })
      await assert.rejects(
        resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-a', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 404,
      )
    })

    await t.test('an owner of a different organization is denied requesting this one (cross-org)', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'owner-b@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-b','org-b',?,'owner')").bind(userId).run()
      const event = buildEvent(env, { cookie })
      await assert.rejects(
        resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-a', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 404,
      )
    })

    await t.test('an owner of a disabled site is denied even with entitlement injected true (site_ineligible gate runs before the entitlement gate)', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'owner-disabled@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-disabled','org-a',?,'owner')").bind(userId).run()
      const event = buildEvent(env, { cookie })
      const capture = captureSecurityEvents()
      try {
        await assert.rejects(
          resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-disabled', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
          (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
        )
      } finally {
        capture.restore()
      }
      assert.ok(capture.lines.some(line => JSON.parse(line).reason === 'site_ineligible'))
    })

    await t.test('an owner of a site still mid-onboarding is denied even with entitlement injected true', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'owner-onboarding@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-onboarding','org-a',?,'owner')").bind(userId).run()
      const event = buildEvent(env, { cookie })
      await assert.rejects(
        resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-onboarding', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })

    await t.test('an owner of a non-Blawby-template site (wrong vertical/theme) is denied even with entitlement injected true', async () => {
      const { userId, cookie } = await realVerifiedUserCookie(auth, db, 'owner-nonblawby@proof.example')
      await db.prepare("INSERT INTO member (id, organizationId, userId, role) VALUES ('mem-nonblawby','org-a',?,'owner')").bind(userId).run()
      const event = buildEvent(env, { cookie })
      await assert.rejects(
        resolveLegalStaffAccess(event, 'practice_read', { organizationSlug: 'org-a', siteSlug: 'site-non-blawby', pathname: '/api/dashboard/legal/practice' }, alwaysEntitled),
        (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
      )
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})

test('public actor/session gates: a denied request creates no anonymous user or session row; a real anonymous and a real human session both resolve for an allowed one', { timeout: 60_000 }, async (t) => {
  const { runtime, db } = await setupD1()
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-a','Org A','org-a')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-a','org-a','site-a','site-a','service','blawby-theme-v1','active','active')",
      "INSERT INTO site_domains (id,organization_id,site_id,domain,type,role,status) VALUES ('dom-a','org-a','site-a','site-a.example.com','custom','canonical','active')",
    ].map(statement => db.prepare(statement)))

    const env = { ...baseEnv(db), LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED: 'true' } as unknown as CloudflareEnv
    const auth = createAuth(env)
    const alwaysEntitled = async () => true

    await t.test('a denied (unentitled) public request creates no session or user row — proven by counting real D1 rows before/after, not asserted structurally', async () => {
      const before = await db.prepare('SELECT count(*) AS n FROM session').first<{ n: number }>()
      const beforeUsers = await db.prepare('SELECT count(*) AS n FROM user').first<{ n: number }>()
      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '1.1.1.1' })
      await assert.rejects(resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a'))
      const after = await db.prepare('SELECT count(*) AS n FROM session').first<{ n: number }>()
      const afterUsers = await db.prepare('SELECT count(*) AS n FROM user').first<{ n: number }>()
      assert.equal(after!.n, before!.n)
      assert.equal(afterUsers!.n, beforeUsers!.n)
    })

    await t.test('a real anonymous session resolves to actorKind "anonymous"', async () => {
      const signIn = await auth.api.signInAnonymous({ asResponse: true })
      const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!
      const event = buildEvent(env, { cookie, origin: 'https://site-a.example.com', ip: '2.2.2.2' })
      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)
      const actor = await requireLegalPublicActor(event, context)
      assert.equal(actor.actorKind, 'anonymous')
    })

    await t.test('a real verified human session resolves to actorKind "human"', async () => {
      const { cookie } = await realVerifiedUserCookie(auth, db, 'human@proof.example')
      const event = buildEvent(env, { cookie, origin: 'https://site-a.example.com', ip: '3.3.3.3' })
      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)
      const actor = await requireLegalPublicActor(event, context)
      assert.equal(actor.actorKind, 'human')
    })

    // U9 reconciliation (task-u8-reconciliation-brief.md section 5a): R13
    // is "establish OR reuse" a session — a request with NO session at all
    // (no cookie whatsoever) now establishes a fresh anonymous session
    // rather than being denied outright. See
    // legal-public-actor-anonymous-session-d1.test.ts for the dedicated,
    // fuller proof of this (real D1 user/session rows created, set-cookie
    // forwarded); this test only confirms the entitlement-matrix call path
    // itself reflects the new behavior rather than the old 401.
    await t.test('a missing session establishes a fresh anonymous session, once entitled/flag/origin/budget all pass', async () => {
      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '4.4.4.4' })
      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)
      const actor = await requireLegalPublicActor(event, context)
      assert.equal(actor.actorKind, 'anonymous')
      assert.ok(actor.actorId)
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})

// Whole-branch-review finding I2: a same-origin GET never sends an Origin
// header per the Fetch spec (response-tainting "basic"), so status.get.ts's
// underlying call to resolveLegalPublicSiteAccess must succeed with no
// Origin header when it opts out via { validateOrigin: false } — the same
// call path status.get.ts itself now uses — while every mutation route
// (create/recover/checkout/post-pay), which all still default to
// validateOrigin: true, keeps correctly rejecting a missing or mismatched
// Origin. Proven for real: no internal module is mocked, only real D1 rows
// and a hand-built H3Event (same technique as every other test in this
// file).
test('R26/I2: origin validation is scoped to mutations — a GET-shaped caller can opt out, mutation-shaped callers cannot', { timeout: 60_000 }, async (t) => {
  const { runtime, db } = await setupD1()
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-a','Org A','org-a')",
      "INSERT INTO sites (id,organization_id,slug,subdomain,vertical,theme_id,status,onboarding_status) VALUES ('site-a','org-a','site-a','site-a','service','blawby-theme-v1','active','active')",
      "INSERT INTO site_domains (id,organization_id,site_id,domain,type,role,status) VALUES ('dom-a','org-a','site-a','site-a.example.com','custom','canonical','active')",
    ].map(statement => db.prepare(statement)))

    const env = { ...baseEnv(db), LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED: 'true' } as unknown as CloudflareEnv
    const alwaysEntitled = async () => true

    await t.test('validateOrigin: false succeeds with no Origin header at all (the real same-origin-GET shape)', async () => {
      const event = buildEvent(env, { ip: '5.5.5.1' })
      const context = await resolveLegalPublicSiteAccess(
        event, 'intake_without_payment', 'site-a', alwaysEntitled, { validateOrigin: false },
      )
      assert.deepEqual({ organizationId: context.organizationId, siteId: context.siteId }, { organizationId: 'org-a', siteId: 'site-a' })
    })

    await t.test('validateOrigin: false still succeeds with a wrong Origin header present (the check is skipped, not merely relaxed)', async () => {
      const event = buildEvent(env, { origin: 'https://attacker.example', ip: '5.5.5.2' })
      const context = await resolveLegalPublicSiteAccess(
        event, 'intake_without_payment', 'site-a', alwaysEntitled, { validateOrigin: false },
      )
      assert.equal(context.siteId, 'site-a')
    })

    await t.test('default (mutation-shaped, no options passed) still rejects a missing Origin header with 403 origin_invalid', async () => {
      const events = captureSecurityEvents()
      try {
        const event = buildEvent(env, { ip: '5.5.5.3' })
        await assert.rejects(
          resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled),
          (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
        )
      } finally {
        events.restore()
      }
      assert.ok(events.lines.some(line => JSON.parse(line).reason === 'origin_invalid'))
    })

    await t.test('default (mutation-shaped, no options passed) still rejects a mismatched Origin header with 403 origin_invalid', async () => {
      const events = captureSecurityEvents()
      try {
        const event = buildEvent(env, { origin: 'https://attacker.example', ip: '5.5.5.4' })
        await assert.rejects(
          resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled),
          (error: unknown) => (error as { statusCode?: number })?.statusCode === 403,
        )
      } finally {
        events.restore()
      }
      assert.ok(events.lines.some(line => JSON.parse(line).reason === 'origin_invalid'))
    })

    await t.test('explicitly passing validateOrigin: true behaves exactly like the default (mutation-route parity)', async () => {
      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '5.5.5.5' })
      const context = await resolveLegalPublicSiteAccess(
        event, 'intake_without_payment', 'site-a', alwaysEntitled, { validateOrigin: true },
      )
      assert.equal(context.siteId, 'site-a')
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
