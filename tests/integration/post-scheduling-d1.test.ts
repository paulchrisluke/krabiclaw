import { parsePostInput } from '../../shared/posts.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { createPost, updatePost, publishPost, getPublishedPosts, getPublishedPost, listPosts, publishDuePosts } from '../../server/utils/post-management.ts'

test('social drafts, unlisted publication and scheduled posts preserve lifecycle at the D1 boundary', async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'post-scheduling-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    for (const statement of readFileSync('migrations/0000_baseline.sql', 'utf8').split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
    for (const statement of [
      "INSERT INTO organization (id, name, slug) VALUES ('org-proof', 'Proof', 'proof')",
      "INSERT INTO sites (id, organization_id, slug, subdomain) VALUES ('site-proof', 'org-proof', 'proof', 'proof')",
      "INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status) VALUES ('source-proof', 'org-proof', 'site-proof', 'en', 1, 'published')",
      "INSERT INTO user (id, name, email) VALUES ('user-proof', 'Proof Owner', 'owner@proof.example')",
    ]) await db.prepare(statement).run()
    for (const [id, scheduledFor] of [
      ['negative-offset', '2099-01-01T09:00:00-05:00'],
      ['positive-offset', '2099-01-01T11:00:00+02:00'],
    ]) {
      await db.prepare(`
        INSERT INTO content_documents (id, organization_id, site_id, kind, row_role, locale, summary, status, visibility, source, metadata_json, scheduled_for, created_by, updated_at)
        VALUES (?, 'org-proof', 'site-proof', 'social_post', 'root', 'en', 'Scheduled proof', 'scheduled', 'public', 'manual', '{"post_type":"standard","channels":{}}', ?, 'user-proof', '2098-12-31T00:00:00.000Z')
      `).bind(id, parsePostInput({ body: 'Scheduled proof', scheduled_for: scheduledFor }).scheduled_for).run()
    }
    const cutoff = new Date('2099-01-01T10:00:00.000Z')
    assert.deepEqual(await publishDuePosts(db, cutoff), { published: 1 })
    const rows = await db.prepare("SELECT id, status, scheduled_for, published_at FROM content_documents WHERE kind = 'social_post' ORDER BY id").all()
    assert.deepEqual(rows.results, [
      { id: 'negative-offset', status: 'scheduled', scheduled_for: '2099-01-01T14:00:00.000Z', published_at: null },
      { id: 'positive-offset', status: 'published', scheduled_for: null, published_at: '2099-01-01T09:00:00.000Z' },
    ])
    assert.deepEqual(await publishDuePosts(db, cutoff), { published: 0 })
    const finalCutoff = new Date('2099-01-01T14:00:00.000Z')
    const concurrent = await Promise.all([publishDuePosts(db, finalCutoff), publishDuePosts(db, finalCutoff)])
    assert.equal(concurrent.reduce((sum, result) => sum + result.published, 0), 1)
    assert.deepEqual(await publishDuePosts(db, finalCutoff), { published: 0 })
    assert.equal(await db.prepare("SELECT count(*) FROM activity_entries WHERE kind = 'audit'").first('count(*)'), 2)
    assert.equal(await db.prepare("SELECT count(*) FROM content_documents, json_each(metadata_json, '$.channels') WHERE kind = 'social_post'").first('count(*)'), 0)
    assert.equal(await db.prepare("SELECT first_published_at FROM content_documents WHERE id = 'positive-offset'").first('first_published_at'), '2099-01-01T09:00:00.000Z')

    const post = await createPost(db, 'org-proof', 'site-proof', { body: 'Private first draft', slug: 'draft-first' }, 'user-proof', {})
    assert.equal(post.status, 'draft')
    assert.equal(post.visibility, 'public')
    assert.equal(post.published_at, null)
    assert.equal(post.public_path, null)
    assert.equal(post.canonical_url, null)
    assert.equal(await db.prepare('SELECT first_published_at FROM content_documents WHERE id=?').bind(post.id).first('first_published_at'), null)
    assert.deepEqual((await listPosts(db, 'org-proof', 'site-proof', 'draft')).map(row => row.id), [post.id])
    assert.equal(await getPublishedPost(db, 'site-proof', { slug: 'draft-first' }), null)
    assert(!(await getPublishedPosts(db, 'site-proof')).some(row => row.id === post.id))

    await updatePost(db, 'org-proof', 'site-proof', post.id, { slug: 'draft-renamed', visibility: 'unlisted' }, 'user-proof', {})
    assert.equal(await db.prepare('SELECT count(*) FROM site_redirects WHERE owner_id=?').bind(post.id).first('count(*)'), 0)
    assert.equal(await db.prepare('SELECT first_published_at FROM content_documents WHERE id=?').bind(post.id).first('first_published_at'), null)
    const live = await publishPost(db, 'org-proof', 'site-proof', post.id, ['site'], {}, null)
    assert(live)
    assert.equal(live.status, 'published')
    assert.equal(live.visibility, 'unlisted')
    const firstPublished = await db.prepare('SELECT first_published_at FROM content_documents WHERE id=?').bind(post.id).first('first_published_at')
    assert.equal(firstPublished, live.published_at)
    assert(firstPublished)
    assert.equal((await getPublishedPost(db, 'site-proof', { slug: 'draft-renamed' }))?.id, post.id)
    assert(!(await getPublishedPosts(db, 'site-proof')).some(row => row.id === post.id))
    await updatePost(db, 'org-proof', 'site-proof', post.id, { visibility: 'public' }, 'user-proof', {})
    assert((await getPublishedPosts(db, 'site-proof')).some(row => row.id === post.id))
    await assert.rejects(updatePost(db, 'org-proof', 'site-proof', post.id, { scheduled_for: '2099-02-01T00:00:00.000Z' }, 'user-proof', {}), /cannot be rescheduled/)
    await assert.rejects(updatePost(db, 'org-proof', 'site-proof', post.id, { status: 'draft' }, 'user-proof', {}), /unknown field status/)
    await publishPost(db, 'org-proof', 'site-proof', post.id, ['site'], {}, null)
    assert.equal(await db.prepare('SELECT first_published_at FROM content_documents WHERE id=?').bind(post.id).first('first_published_at'), firstPublished)

    const queued = await createPost(db, 'org-proof', 'site-proof', { body: 'Queue this draft' }, 'user-proof', {})
    await updatePost(db, 'org-proof', 'site-proof', queued.id, { scheduled_for: '2099-02-01T00:00:00.000Z' }, 'user-proof', {})
    assert.equal(await db.prepare('SELECT status FROM content_documents WHERE id=?').bind(queued.id).first('status'), 'scheduled')
    await assert.rejects(updatePost(db, 'org-proof', 'site-proof', queued.id, { scheduled_for: null }, 'user-proof', {}), /cannot be cleared/)
    assert(queued.slug)
    assert.equal(await getPublishedPost(db, 'site-proof', { slug: queued.slug }), null)
    assert.deepEqual(await publishDuePosts(db, new Date('2099-02-01T00:00:00.000Z')), { published: 1 })
    assert.equal(await db.prepare('SELECT first_published_at FROM content_documents WHERE id=?').bind(queued.id).first('first_published_at'), '2099-02-01T00:00:00.000Z')
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally {
    await runtime.dispose()
  }
})
