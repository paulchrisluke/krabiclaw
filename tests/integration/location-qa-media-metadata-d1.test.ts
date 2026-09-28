import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { createQa, deleteQa, listQa, reorderQa, updateQa } from '../../server/utils/location-qa.ts'
import { getMediaAsset, updateMediaAssetMetadata } from '../../server/utils/media-asset-manager.ts'

const ORG = 'org'
const OTHER_ORG = 'other-org'
const NOW = '2026-09-28T00:00:00.000Z'

async function boot() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'location-qa-media-metadata-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  for (const org of [ORG, OTHER_ORG]) {
    await db.prepare(`INSERT INTO organization (id, name, slug, settings_json, integrations_json, theme_id, default_currency, status, onboarding_status, url_structure, vertical, updated_at)
      VALUES (?, 'Org', ?, '{"config":{"default_timezone":"Asia/Bangkok"}}', '{}', 'saya-theme-v1', 'THB', 'active', 'complete', 'flat', 'restaurant', ?)`).bind(org, org, NOW).run()
    await db.prepare("INSERT INTO organization_locales (id, organization_id, locale, is_source, status) VALUES (?, ?, 'en', 1, 'published')")
      .bind(`locale-${org}`, org).run()
  }
  return { runtime, db }
}

// Both writers bound one value more than their SQL had placeholders, which D1
// refuses; every Q&A edit answered 400 and every alt-text edit 500 on
// production. The proof is the real function against real D1: a mocked
// database accepts any bind count.
test('a Q&A can be edited and deleted through the scoped writers', async () => {
  const { runtime, db } = await boot()
  try {
    const scope = { organizationId: ORG, locationId: null, pagePath: '/pricing' }
    const created = await createQa(db, scope, { question: 'Is there a free plan?', answer: 'Yes.', status: 'published' })
    assert.equal(created.status, 201)
    const qaId = (created.data as { id: string }).id

    const updated = await updateQa(db, scope, qaId, { answer: 'Yes, on a Krabiclaw subdomain.' })
    assert.deepEqual(updated, { updated: true, qa_id: qaId })
    const [row] = await listQa(db, ORG, null, false, '/pricing')
    assert.equal(row?.answer, 'Yes, on a Krabiclaw subdomain.')

    await assert.rejects(
      updateQa(db, { ...scope, organizationId: OTHER_ORG }, qaId, { answer: 'stolen' }),
      /Q&A not found/,
    )

    const second = await createQa(db, scope, { question: 'Can I use my own domain?', answer: 'Yes.' })
    const secondId = (second.data as { id: string }).id
    await reorderQa(db, scope, [{ id: secondId, sort_order: 0 }, { id: qaId, sort_order: 1 }])
    assert.deepEqual((await listQa(db, ORG, null, false, '/pricing')).map(item => item.id), [secondId, qaId])
    await deleteQa(db, scope, secondId)

    const deletedElsewhere = await deleteQa(db, { ...scope, organizationId: OTHER_ORG }, qaId)
    assert.equal(deletedElsewhere.status, 404)
    const deleted = await deleteQa(db, scope, qaId)
    assert.equal(deleted.status, 200)
    assert.equal((await listQa(db, ORG, null, false, '/pricing')).length, 0)
  } finally {
    await runtime.dispose()
  }
})

test('media metadata is updated only within its organization', async () => {
  const { runtime, db } = await boot()
  try {
    await db.prepare(`INSERT INTO media_assets (id, organization_id, kind, provider, source, public_url, mime_type, alt_text, status, created_at, updated_at)
      VALUES ('asset-1', ?, 'image', 'cloudflare_images', 'uploaded', 'https://imagedelivery.net/acct/asset-1/public', 'image/png', 'KrabiClaw crab', 'active', ?, ?)`)
      .bind(ORG, NOW, NOW).run()

    assert.equal(await updateMediaAssetMetadata(db, 'asset-1', OTHER_ORG, { alt_text: 'stolen' }), false)
    assert.equal(await updateMediaAssetMetadata(db, 'asset-1', ORG, { alt_text: 'Krabiclaw crab' }), true)
    assert.equal((await getMediaAsset(db, 'asset-1', ORG))?.alt_text, 'Krabiclaw crab')
  } finally {
    await runtime.dispose()
  }
})
