import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import { createContentDocumentWithBlocks, updateContentDocument } from '../../server/utils/content/documents.ts'
import { buildPlatformKnowledgeDocuments, buildTenantBlogDocuments } from '../../server/utils/public-search.ts'
import { listSocialCardOwners } from '../../server/utils/social-card.ts'
import { listPublicBlogSummaries } from '../../server/utils/professional-services.ts'

test('public discovery resolves translations through current publication owners', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'content-discovery-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    for (const id of ['platform', 'tenant', 'other']) {
      // KrabiClaw's own organization is the one running the platform template.
      await db.prepare('INSERT INTO organization (id,name,slug,subdomain,theme_id,vertical) VALUES (?,?,?,?,?,?)')
        .bind(id, id, id, id, id === 'platform' ? 'krabiclaw-theme-v1' : 'saya-theme-v1', id === 'platform' ? 'service' : 'restaurant').run()
      for (const locale of ['en', 'th']) await db.prepare('INSERT INTO organization_locales (id,organization_id,locale,is_source,status) VALUES (?,?,?,?,?)')
        .bind(id + locale, id, locale, Number(locale === 'en'), 'published').run()
    }
    // Documentation is the platform organization's docs article collection.
    await createContentDocumentWithBlocks(db, { id: 'guide', organizationId: 'platform', kind: 'article', rowRole: 'root', locale: 'en',
      title: 'guide', slug: 'guide', summary: 'guide summary', status: 'published', visibility: 'listed',
      metadata: { collection: 'docs', category: 'Getting Started', tags: [] },
    }, [{ id: 'guide-body', type: 'markdown', data: { markdown: 'guide exact body', editor_mode: 'rich' } }])
    for (const [id, org] of [['news', 'platform'], ['tenant-story', 'tenant'], ['other-story', 'other']] as const) {
      await createContentDocumentWithBlocks(db, { id, organizationId: org, kind: 'article', rowRole: 'root', locale: 'en',
        title: id, slug: id, summary: id + ' summary', metadata: { collection: 'blog', category: 'Marketing', tags: ['shared'] }, status: 'published', visibility: 'listed',
      }, [{ id: id + '-body', type: 'markdown', data: { markdown: id + ' exact body', editor_mode: 'rich' } }])
    }
    for (const [id, path] of [['home', '/'], ['about', '/about']]) await createContentDocumentWithBlocks(db, {
      id, organizationId: 'tenant', kind: 'page', rowRole: 'root', locale: 'en', title: id, path,
      metadata: { page_type: 'custom' },
    }, [])
    const { document: hidden } = await createContentDocumentWithBlocks(db, { id: 'hidden', organizationId: 'tenant',
      kind: 'article', rowRole: 'root', locale: 'en', title: 'Hidden', slug: 'hidden', status: 'published', visibility: 'unlisted' }, [])
    await createContentDocumentWithBlocks(db, { id: 'future', organizationId: 'tenant', kind: 'article', rowRole: 'root',
      locale: 'en', title: 'Future', slug: 'future', status: 'scheduled', visibility: 'listed', scheduledFor: '2099-01-01T00:00:00.000Z' }, [])
    await createContentDocumentWithBlocks(db, { id: 'story-th', organizationId: 'tenant', kind: 'article', rowRole: 'representation',
      rootId: 'tenant-story', locale: 'th', title: 'Translated story', slug: 'translated', path: '/blog/translated', summary: 'Translated summary' }, [])
    const tenantRecords = await buildTenantBlogDocuments(db)
    assert.deepEqual(tenantRecords.map(record => record.id).sort(), ['tenant-blog:other-story', 'tenant-blog:tenant-story'])
    assert(tenantRecords.find(record => record.id === 'tenant-blog:tenant-story')?.body.includes('tenant story exact body'))
    const platformRecords = await buildPlatformKnowledgeDocuments(db)
    assert(platformRecords.find(record => record.id === 'doc:guide')?.body.includes('guide exact body'))
    assert(!platformRecords.some(record => record.id.includes(hidden.id) || record.id.includes('future')))
    const cards = await listSocialCardOwners(db)
    assert(cards.some(owner => owner.owner_type === 'content_document' && owner.owner_id === 'guide'))
    assert(cards.some(owner => owner.owner_type === 'content_document' && owner.owner_id === 'about'))
    assert(!cards.some(owner => owner.owner_type === 'content_document' && ['home', 'future'].includes(owner.owner_id)))
    const translated = await listPublicBlogSummaries(db, 'tenant', 50, 'th')
    assert.deepEqual(translated.map(row => [row.id, row.title, row.excerpt, row.canonical_url]), [
      ['tenant-story', 'Translated story', 'Translated summary', '/th/blog/translated'],
    ])
    const source = await db.prepare("SELECT updated_at FROM content_documents WHERE id = 'tenant-story'").first<string>('updated_at')
    assert(source)
    await updateContentDocument(db, 'tenant-story', { expected_updated_at: source, changes: { visibility: 'unlisted' } })
    assert.deepEqual(await listPublicBlogSummaries(db, 'tenant', 50, 'th'), [])
    assert(!(await buildTenantBlogDocuments(db)).some(record => record.id === 'tenant-blog:tenant-story'))
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally {
    await runtime.dispose()
  }
})
