import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { createSystemSubdomain, isSystemSubdomainSpent, ensureDomainAvailable, reconcileDueDomains, syncDomainWithCloudflare, deleteCustomDomain } from '../../server/utils/domains.ts'
import { fireOrganizationEvent } from '../../server/utils/organization-events.ts'
import { listDashboardEvents } from '../../server/utils/dashboard-events.ts'

test('domain claims fence stale results and permanent subdomain reservations survive organization deletion', async (t) => {
  const miniflare = new Miniflare({ workers: [{ config: { name: 'owner-domain-test', type: 'worker', compatibilityDate: '2024-11-01', manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } }, env: { DB: { type: 'd1' } } } }] })
  try {
    const db = await miniflare.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization(id,name,slug) VALUES('org','Org','org'),('other','Other','other'),('audit','Audit','audit')").run()
    const env = { NUXT_PUBLIC_FREE_SITE_DOMAIN: 'example.test', CF_ZONE_ID: 'zone', CF_CUSTOM_HOSTNAMES_API_TOKEN: 'test', CF_SAAS_CNAME_TARGET: 'target.example.test' }
    await createSystemSubdomain(env, db, 'org', 'first')
    await createSystemSubdomain(env, db, 'org', 'second')
    assert.equal(await isSystemSubdomainSpent(env, db, 'first'), true)
    await db.prepare("DELETE FROM organization WHERE id='org'").run()
    assert.equal(await isSystemSubdomainSpent(env, db, 'first'), true)
    await assert.rejects(ensureDomainAvailable(db, ['first.example.test'], 'audit'))
    await assert.rejects(db.prepare("INSERT INTO organization_domains(id,domain,type,status) VALUES('bad','bad.example.test','custom','pending')").run())
    await db.prepare("INSERT INTO organization_domains(id,organization_id,domain,type,status) VALUES('custom','audit','custom.example.test','custom','pending')").run()
    let requestsMade = 0
    let providerMode: 'pending' | 'stale' | 'delete-failed' | 'delete-success' = 'pending'
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.ok(String(url).startsWith('https://api.cloudflare.com/'))
      requestsMade += 1
      if (providerMode === 'stale') await db.prepare("UPDATE organization_domains SET status='disabled', reconciliation_token=NULL, reconciliation_expires_at=NULL WHERE id='custom'").run()
      if (providerMode === 'delete-failed') return Response.json({ success: false, errors: [{ message: 'provider unavailable' }] }, { status: 503 })
      if (providerMode === 'delete-success') { assert.equal(init?.method, 'DELETE'); return Response.json({ success: true, result: {} }) }
      return Response.json({ success: true, result: { id: 'provider-id', hostname: 'custom.example.test', status: 'pending', ssl: { status: 'pending_validation' } } })
    })
    const results = await Promise.all([reconcileDueDomains(env, db), reconcileDueDomains(env, db)])
    assert.equal(results.reduce((total, result) => total + result.checked, 0), 1)
    assert.equal(requestsMade, 1)
    assert.equal((await db.prepare("SELECT status FROM organization_domains WHERE id='custom'").first())?.status, 'verifying')
    providerMode = 'stale'
    await db.prepare("UPDATE organization_domains SET cloudflare_hostname_id=NULL WHERE id='custom'").run()
    await assert.rejects(syncDomainWithCloudflare(env, db, 'custom'))
    assert.equal((await db.prepare("SELECT status FROM organization_domains WHERE id='custom'").first())?.status, 'disabled')
    await db.prepare("UPDATE organization_domains SET status='verifying',cloudflare_hostname_id='provider-id' WHERE id='custom'").run()
    providerMode = 'delete-failed'
    await assert.rejects(deleteCustomDomain(env, db, 'custom', 'system'))
    const failedDelete = await db.prepare("SELECT desired_state,next_check_at,reconciliation_token FROM organization_domains WHERE id='custom'").first()
    assert.equal(failedDelete?.desired_state, 'deleted')
    assert.equal(failedDelete?.reconciliation_token, null)
    assert.ok(failedDelete?.next_check_at)
    providerMode = 'delete-success'
    await db.prepare("UPDATE organization_domains SET next_check_at=NULL WHERE id='custom'").run()
    assert.equal((await reconcileDueDomains(env, db)).checked, 1)
    assert.equal((await db.prepare("SELECT status FROM organization_domains WHERE id='custom'").first())?.status, 'deleted')
    await fireOrganizationEvent({ db, organizationId: 'audit', eventType: 'content.updated', entityType: 'organization', entityId: 'audit' })
    assert.ok((await listDashboardEvents(db, 'audit', {})).events.some(event => event.event_type === 'content.updated'))
    assert.equal((await listDashboardEvents(db, 'other', {})).events.length, 0)
    // The audit trail belongs to the organization it describes: deleting the
    // organization takes its entries with it rather than stranding them.
    await db.prepare("DELETE FROM organization WHERE id='audit'").run()
    assert.equal((await db.prepare("SELECT count(*) AS n FROM activity_entries WHERE event_name='content.updated'").first())?.n, 0)
  } finally { await miniflare.dispose() }
})
