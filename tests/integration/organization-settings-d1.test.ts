import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { getConfig, setConfig } from '../../server/utils/organization-config.ts'
import { deleteIntegration, listIntegrations, readIntegration, storeIntegration } from '../../server/utils/organization-integrations.ts'
import { getWhatsAppWorkspaceState, patchWhatsAppWorkspaceState, getMcpWorkspacePreference, upsertMcpWorkspacePreference } from '../../server/utils/mcp-context.ts'

test('organization settings and workspace patches preserve independent owners and hold no provider credentials', async () => {
  const miniflare = new Miniflare({ workers: [{ config: {
    name: 'owner-settings-test', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': {
      type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
    } } }, env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await miniflare.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.prepare("INSERT INTO organization(id,name,slug,subdomain) VALUES('org','Org','org','org')").run()
    await db.prepare("INSERT INTO user(id,name,email) VALUES('user','User','user@example.test')").run()
    await Promise.all([setConfig(db, 'org', 'brand_color', '#123456'), setConfig(db, 'org', 'default_timezone', 'Asia/Bangkok')])
    assert.equal((await getConfig(db, 'org')).brand_color, '#123456')
    assert.equal((await getConfig(db, 'org')).default_timezone, 'Asia/Bangkok')
    // The measurement id is the Analytics integration's, and choosing a GA4
    // property is the only thing that writes it — so it is readable here and
    // there is no settings key that sets it.
    await storeIntegration(db, 'org', 'google_analytics', { account_id: 'google-account', target_id: '100', target_name: 'OAuth', measurement_id: 'G-OAUTH' })
    assert.equal((await getConfig(db, 'org')).google_analytics_measurement_id, 'G-OAUTH')
    await assert.rejects(db.prepare("UPDATE organization SET settings_json=json_set(settings_json,'$.consultation',json('{}')) WHERE id='org'").run())
    await assert.rejects(setConfig(db, 'other', 'brand_color', '#000000'))
    assert.equal(await deleteIntegration(db, 'org', 'google_analytics'), true)
    const selection = { account_id: 'google-account', target_id: '123', target_name: 'Site', measurement_id: 'G-SELECTED' }
    // Two selections landing together: the revision guard means one wins.
    const attempts = await Promise.allSettled([storeIntegration(db, 'org', 'google_analytics', selection, { revision: null }), storeIntegration(db, 'org', 'google_analytics', selection, { revision: null })])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    // The organization keeps its selection and the Better Auth account it was
    // made through, and no credential of its own.
    const stored = await readIntegration(db, 'org', 'google_analytics')
    assert.equal(stored?.account_id, 'google-account')
    assert.equal(stored?.measurement_id, 'G-SELECTED')
    assert.deepEqual((await listIntegrations(db, 'org')).map(integration => integration.provider), ['google_analytics'])
    await setConfig(db, 'org', 'brand_color', '#abcdef')

    await patchWhatsAppWorkspaceState(db, { userId: 'user', pendingConfirmation: { intent: 'one' } })
    await Promise.all([patchWhatsAppWorkspaceState(db, { userId: 'user', lastInboundId: 'inbound' }), upsertMcpWorkspacePreference(db, { userId: 'user', organizationId: 'org', locationId: null })])
    assert.equal((await getWhatsAppWorkspaceState(db, 'user'))?.pending_confirmation, '{"intent":"one"}')
    assert.equal((await getWhatsAppWorkspaceState(db, 'user'))?.last_inbound_id, 'inbound')
    assert.equal((await getMcpWorkspacePreference(db, 'user'))?.organization_id, 'org')
    await patchWhatsAppWorkspaceState(db, { userId: 'user', pendingConfirmation: null })
    assert.equal((await getMcpWorkspacePreference(db, 'user'))?.organization_id, 'org')
  } finally { await miniflare.dispose() }
})
