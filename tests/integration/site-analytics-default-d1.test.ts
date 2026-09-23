import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { cleanupTenantAnalytics, getSiteAnalyticsReport } from '../../server/utils/site-analytics-report.ts'
import { deleteConfig, setConfig } from '../../server/utils/site-config.ts'

test('a new organization initializes analytics time without inventing a location timezone', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'site-default-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    for (const id of ['org', 'platform', 'mcp-fixture']) {
      await db.prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)').bind(id, id, id).run()
      assert.equal(await db.prepare("SELECT settings_json ->> '$.config.default_timezone' AS zone FROM organization WHERE id = ?").bind(id).first('zone'), 'UTC')
    }
    await db.prepare("INSERT INTO business_locations (id, organization_id, slug, title) VALUES ('location', 'org', 'location', 'Location')").run()
    assert.equal(await db.prepare("SELECT timezone FROM business_locations WHERE id = 'location'").first('timezone'), null)
    for (const settings of ['{}', '{"config":{"default_timezone":""}}']) {
      await assert.rejects(db.prepare("UPDATE organization SET settings_json = ? WHERE id = 'org'").bind(settings).run(), /CHECK constraint failed/)
    }
    await assert.rejects(setConfig(db, 'org', 'default_timezone', 'Unknown/Timezone'), /valid analytics timezone/)
    await assert.rejects(deleteConfig(db, 'org', 'default_timezone'), /cannot be removed/)
    await setConfig(db, 'org', 'brand_color', '#123456')
    await setConfig(db, 'mcp-fixture', 'default_timezone', 'Asia/Bangkok')
    await db.prepare(`INSERT INTO analytics_events (id, kind, organization_id, page_path, created_at, payload_json)
      VALUES ('old-pageview', 'pageview', 'org', '/menu', '2026-01-01T00:00:00.000Z', '{}')`).run()
    await cleanupTenantAnalytics(db, new Date('2026-09-06T12:00:00Z'))
    assert.equal(await db.prepare("SELECT count(*) AS count FROM analytics_events WHERE id = 'old-pageview'").first('count'), 0)
    for (const { id, zone } of [{ id: 'org', zone: 'UTC' }, { id: 'platform', zone: 'UTC' }, { id: 'mcp-fixture', zone: 'Asia/Bangkok' }]) {
      const report = await getSiteAnalyticsReport(db, { organizationId: id, startDate: '2026-09-05', endDate: '2026-09-06', now: new Date('2026-09-06T12:00:00Z') })
      assert.equal(report.period.timezone, zone)
    }
    assert.equal(await db.prepare("SELECT settings_json ->> '$.config.brand_color' AS color FROM organization WHERE id = 'org'").first('color'), '#123456')
    assert.equal(await db.prepare("SELECT timezone FROM business_locations WHERE id = 'location'").first('timezone'), null)
  } finally { await runtime.dispose() }
})
