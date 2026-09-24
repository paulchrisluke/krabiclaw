import assert from 'node:assert/strict'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { deleteConfig, getConfig, setConfig } from '../../server/utils/site-config.ts'
import { readAnalyticsIntegration } from '../../server/utils/google-analytics.ts'
import { readGoogleCredential, storeGoogleCredential } from '../../server/utils/google-credential.ts'
import { getWhatsAppWorkspaceState, patchWhatsAppWorkspaceState, getMcpWorkspacePreference, upsertMcpWorkspacePreference } from '../../server/utils/mcp-context.ts'

test('organization settings and workspace patches preserve independent owners and exclude provider secrets', async () => {
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
    await setConfig(db, 'org', 'social_facebook', 'https://facebook.com/example')
    assert.equal((await getConfig(db, 'org')).social_facebook, 'https://facebook.com/example')
    assert.equal((await db.prepare("SELECT settings_json FROM organization WHERE id='org'").first<{ settings_json: string }>())?.settings_json.includes('social_facebook'), false)
    await deleteConfig(db, 'org', 'social_facebook')
    assert.equal((await getConfig(db, 'org')).social_facebook, undefined)
    // The measurement id is the Analytics integration's, and choosing a GA4
    // property is the only thing that writes it — so it is readable here and
    // there is no settings key that sets it.
    await db.prepare("UPDATE organization SET integrations_json=json_patch(integrations_json,json(?)) WHERE id='org'").bind(JSON.stringify({ google_credential: {"revision": "v1", "status": "active", "provider_account_email": "owner@example.test", "encrypted_access_token": "private-canary", "encrypted_refresh_token": "private-canary-refresh", "scopes": "analytics.readonly", "created_at": "2026-01-01T00:00:00.000Z", "updated_at": "2026-01-01T00:00:00.000Z"}, google_analytics: {"revision": "v1", "status": "active", "measurement_id": "G-OAUTH", "created_at": "2026-01-01T00:00:00.000Z", "updated_at": "2026-01-01T00:00:00.000Z"} })).run()
    assert.equal((await getConfig(db, 'org')).google_analytics_measurement_id, 'G-OAUTH')
    // Reading the settings must never carry the credential's secrets out.
    assert.equal(JSON.stringify(await getConfig(db, 'org')).includes('private-canary'), false)
    await assert.rejects(db.prepare("UPDATE organization SET settings_json=json_set(settings_json,'$.consultation',json('{}')) WHERE id='org'").run())
    await assert.rejects(setConfig(db, 'other', 'brand_color', '#000000'))
    await db.prepare("UPDATE organization SET integrations_json='{}' WHERE id='org'").run()
    const providerEnv = { DB: db, CONNECTOR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }
    const credential = { organization_id: 'org', connected_by_user_id: 'user', provider_account_email: 'owner@example.test', access_token: 'access-token', refresh_token: 'refresh-token', scopes: 'openid email https://www.googleapis.com/auth/analytics.readonly' }
    // Two authorizations landing together: the revision guard means one wins.
    const attempts = await Promise.allSettled([storeGoogleCredential(providerEnv, credential, { revision: null }), storeGoogleCredential(providerEnv, credential, { revision: null })])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    const connected = await readGoogleCredential(providerEnv, 'org')
    assert.ok(connected)
    assert.equal(connected.encrypted_access_token, 'access-token')
    // Connecting the second product grows the granted scopes rather than
    // replacing them, which is what keeps one disconnect from taking the
    // other's access away.
    await storeGoogleCredential(providerEnv, { ...credential, scopes: 'https://www.googleapis.com/auth/webmasters' }, connected)
    const widened = await readGoogleCredential(providerEnv, 'org')
    assert.ok(widened)
    assert.ok(widened.scopes.includes('analytics.readonly'))
    assert.ok(widened.scopes.includes('webmasters'))
    // The credential says nothing about which product selected what.
    assert.ok(!(await readAnalyticsIntegration(providerEnv, 'org')))
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
