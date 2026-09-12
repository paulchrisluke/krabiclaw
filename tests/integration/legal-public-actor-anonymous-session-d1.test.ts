import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { requireLegalPublicActor, resolveLegalPublicSiteAccess } from '../../server/utils/legal-access.ts'

// U9 reconciliation (task-u8-reconciliation-brief.md section 5a):
// requireLegalPublicActor previously only ever REUSED an existing Better
// Auth session -- a first-time visitor with NO session cookie at all was
// permanently denied (401), since nothing in this repo ever called Better
// Auth's anonymous sign-in. This proves the fix: a request with no cookie
// whatsoever reaches requireLegalPublicActor and comes back with a real
// `anonymous` LegalPublicActor, backed by a REAL user/session row in D1 --
// not a mocked session. Same real-D1/no-internal-mocking technique as
// legal-entitlement-rollout-matrix-d1.test.ts; this directory is outside
// check-unit-test-quality.mjs's file/test/line caps (unit tests are
// currently at their cap -- see that file's own comment for the same
// reasoning).

async function setupD1() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'legal-public-actor-anonymous-session-proof', type: 'worker', compatibilityDate: '2024-11-01',
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
    LEGAL_PUBLIC_BUDGET_IP_SITE_OP_LIMIT: '1000',
    LEGAL_PUBLIC_BUDGET_IP_SITE_OP_WINDOW_MS: '3600000',
  } as unknown as CloudflareEnv
}

// Same shape as legal-entitlement-rollout-matrix-d1.test.ts's buildEvent,
// PLUS a real `res.headers` bag -- requireLegalPublicActor's fix forwards
// set-cookie onto the event's outgoing response (appendResponseHeader),
// which needs `event.res.headers` to exist.
function buildEvent(env: CloudflareEnv, opts: { origin?: string; ip?: string } = {}) {
  const headers = new Headers()
  if (opts.origin) headers.set('origin', opts.origin)
  if (opts.ip) headers.set('cf-connecting-ip', opts.ip)
  const url = new URL('https://site-a.example.com/api/public/sites/site-a/legal/intakes')
  return {
    req: { headers, runtime: { cloudflare: { env } } },
    res: { headers: new Headers() },
    path: url.pathname,
    url,
  } as unknown as Parameters<typeof resolveLegalPublicSiteAccess>[0]
}

test('requireLegalPublicActor establishes a fresh anonymous Better Auth session for a first-time visitor with no cookie at all', { timeout: 60_000 }, async (t) => {
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

    await t.test('no cookie -> a real anonymous actor, a real D1 user/session row, and a forwarded set-cookie', async () => {
      const [userRowsBefore, sessionRowsBefore] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM user').first<{ n: number }>(),
        db.prepare('SELECT COUNT(*) AS n FROM session').first<{ n: number }>(),
      ])

      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '10.0.0.1' })
      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)

      const actor = await requireLegalPublicActor(event, context)
      assert.equal(actor.actorKind, 'anonymous')
      assert.ok(actor.actorId, 'a real actor id was returned')

      const [userRowsAfter, sessionRowsAfter] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS n FROM user').first<{ n: number }>(),
        db.prepare('SELECT COUNT(*) AS n FROM session').first<{ n: number }>(),
      ])
      assert.equal(userRowsAfter!.n, userRowsBefore!.n + 1, 'exactly one new real user row was created in D1')
      assert.equal(sessionRowsAfter!.n, sessionRowsBefore!.n + 1, 'exactly one new real session row was created in D1')

      const userRow = await db.prepare('SELECT id, isAnonymous FROM user WHERE id = ?').bind(actor.actorId).first<{ id: string; isAnonymous: number | boolean }>()
      assert.ok(userRow, 'the returned actor id corresponds to a real user row')
      assert.ok(userRow!.isAnonymous, 'the created user row is flagged anonymous, matching resolveLegalPublicActor\'s own signal')

      const setCookies = (event as unknown as { res: { headers: Headers } }).res.headers.getSetCookie?.()
        ?? (event as unknown as { res: { headers: Headers } }).res.headers.get('set-cookie')
      assert.ok(setCookies && (Array.isArray(setCookies) ? setCookies.length > 0 : setCookies.length > 0), 'a session cookie was forwarded onto the outgoing response for the browser to retain')
    })

    await t.test('each cookie-less request establishes its own distinct anonymous actor, not a shared cached one', async () => {
      const event = buildEvent(env, { origin: 'https://site-a.example.com', ip: '10.0.0.2' })
      const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', 'site-a', alwaysEntitled)
      const first = await requireLegalPublicActor(event, context)
      // A genuinely NEW request (fresh event, no cookie) still gets a
      // distinct anonymous actor -- this is the "no session at all" branch
      // firing again, not an accidental cache -- proving the fix creates a
      // session per cookie-less request rather than silently reusing state.
      const secondEvent = buildEvent(env, { origin: 'https://site-a.example.com', ip: '10.0.0.3' })
      const secondContext = await resolveLegalPublicSiteAccess(secondEvent, 'intake_without_payment', 'site-a', alwaysEntitled)
      const second = await requireLegalPublicActor(secondEvent, secondContext)
      assert.notEqual(first.actorId, second.actorId)
    })
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
