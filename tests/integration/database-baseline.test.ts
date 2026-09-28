import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

test('the migration chain applies from zero and builds every table the schema declares', () => {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  try {
    const journal = JSON.parse(readFileSync('migrations/meta/_journal.json', 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
    for (const entry of journal.entries) database.exec(readFileSync(`migrations/${entry.tag}.sql`, 'utf8'))
    const last = journal.entries.at(-1)!
    const snapshot = JSON.parse(readFileSync(`migrations/meta/${String(last.idx).padStart(4, '0')}_snapshot.json`, 'utf8')) as { tables: Record<string, { name: string }> }
    const declared = Object.values(snapshot.tables).map(table => table.name).sort()
    const built = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map(row => row.name)
    assert.deepEqual(built, declared)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

const PRE_EPOCH_BASELINE = 'tests/integration/fixtures/pre-1115-baseline.sql'
const EVENT = { title: 'Pizza night', schedule: { start_date: '2026-10-02', start_time: '18:00:00', end_date: '2026-10-02', end_time: '21:00:00' }, recurrence_info: { kind: 'weekly', days_of_week: ['friday'] } }
const OFFER = { coupon_code: 'OVEN10', redeem_online_url: 'https://order.example.test/oven', terms_conditions: 'Dine-in only.' }
const IDENTITY = { provider_app_id: 'fb-app', provider_subject_id: 'subject-1', provider_target_id: 'page-1', provider_permalink: 'https://www.facebook.com/page-1/posts/1' }

const channel = (entry: Record<string, unknown>) => ({ provider_post_id: null, error_message: null, published_at: null, created_at: '2026-06-01T00:00:00.000Z', ...entry })
const post = (id: string, fields: Record<string, unknown>, metadata: Record<string, unknown>) => {
  const row = { id, organization_id: 'org', kind: 'social_post', row_role: 'root', locale: 'en', status: 'published', visibility: 'listed', source: 'manual',
    created_by: 'owner', published_at: '2026-05-01T00:00:00.000Z', summary: 'Body', ...fields,
    metadata_json: JSON.stringify({ post_type: 'standard', event: null, offer: null, call_to_action: null, alert_type: null, channels: {}, ...metadata }) }
  return `INSERT INTO content_documents (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`).join(',')})`
}

/**
 * A database as the pre-#1115 baseline held it: scheduled articles and posts,
 * event, offer and alert posts with a translation, both call-to-action shapes,
 * a social feature grid with its button and its translation, and every kind of
 * channel entry, including an imported post the importer never gave a slug.
 */
function preEpochSource(directory: string, extra: string[] = []): string {
  const path = join(directory, `source-${Math.random().toString(36).slice(2)}.sqlite`)
  const db = new Database(path)
  db.exec(readFileSync(PRE_EPOCH_BASELINE, 'utf8'))
  db.exec([
    "INSERT INTO organization (id,name,slug) VALUES ('org','Org','org')",
    "INSERT INTO organization_locales (id,organization_id,locale,label,is_source,status) VALUES ('org-en','org','en','English',1,'published'), ('org-th','org','th','Thai',0,'published')",
    "INSERT INTO user (id,name,email,emailVerified) VALUES ('owner','Owner','owner@example.test',1)",
    "INSERT INTO business_locations (id,organization_id,slug,title,timezone,phone) VALUES ('loc','org','main','Main','Asia/Bangkok','+66 75 000 000')",
    "INSERT INTO content_documents (id,organization_id,kind,row_role,locale,title,slug,status,visibility,scheduled_for,metadata_json) VALUES ('article-due','org','article','root','en','Due','due','scheduled','listed','2026-12-01T09:00:00.000Z','{}')",
    post('post-due', { status: 'scheduled', published_at: null, scheduled_for: '2026-12-02T09:00:00.000Z', slug: 'post-due', title: 'Due post' }, {}),
    post('post-event', { slug: 'pizza-night', title: 'Pizza night', location_id: 'loc', summary: 'Come hungry.' }, { post_type: 'event', event: EVENT, call_to_action: { action_type: 'call' } }),
    "INSERT INTO content_documents (id,organization_id,kind,row_role,root_id,root_role,locale,title,slug,path,summary,metadata_json) VALUES ('post-event-th','org','social_post','representation','post-event','root','th','คืนพิซซ่า','pizza-night','/posts/pizza-night','มาหิวๆ', '" + JSON.stringify({ event: { title: 'คืนพิซซ่า' }, offer: null }) + "')",
    post('post-offer', { slug: 'oven-offer', title: 'Oven offer' }, { post_type: 'offer', event: EVENT, offer: OFFER }),
    post('post-alert', { slug: 'alert', title: 'Alert' }, { post_type: 'alert', alert_type: 'covid_19', call_to_action: { action_type: 'learn_more', url: 'https://example.test/safety' } }),
    post('post-sent', { slug: 'sent' }, { channels: {
      facebook: channel({ status: 'published', provider_post_id: 'page-1_1', published_at: '2026-05-01T00:00:01.000Z' }),
      instagram: channel({ status: 'pending' }),
    } }),
    post('post-failed', { slug: 'failed' }, { channels: {
      facebook: channel({ status: 'failed', error_message: 'Facebook API request timed out after 10000ms' }),
      instagram: channel({ status: 'skipped', error_message: 'Instagram requires an image. Add a photo to this post.' }),
    } }),
    post('fb-post-page-1_2', { slug: null, title: null, summary: 'Imported from the Page', created_by: 'facebook-sync', published_at: '2026-04-01T00:00:00.000Z' }, { channels: {
      facebook: channel({ status: 'published', provider_post_id: 'page-1_2', published_at: '2026-04-01T00:00:00.000Z' }),
    } }),
    "INSERT INTO media_assets (id,organization_id,kind,provider,source,r2_key) VALUES ('fb-asset-page-1_2','org','image','cloudflare_r2','external',NULL), ('owner-upload','org','image','cloudflare_images','uploaded',NULL)",
    "INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id,sort_order) VALUES ('p-import','org','content_document','fb-post-page-1_2','cover','fb-asset-page-1_2',0), ('p-owner','org','content_document','fb-post-page-1_2','gallery','owner-upload',0)",
    "INSERT INTO content_documents (id,organization_id,kind,row_role,locale,title,path,metadata_json) VALUES ('home','org','page','root','en','Home','/','{\"page_type\":\"recipe\",\"recipe\":\"home\"}')",
    "INSERT INTO content_documents (id,organization_id,kind,row_role,root_id,root_role,locale,title,path,metadata_json) VALUES ('home-th','org','page','representation','home','root','th','หน้าแรก','/','{}')",
    `INSERT INTO content_blocks (id,document_id,type,position,data_json) VALUES ('grid','home','feature_grid',0,'${JSON.stringify({ source: 'organization_updates', title: 'News', cta_label: 'All news', cta_url: '/posts', items: [{ id: 'stale' }] })}')`,
    `INSERT INTO content_blocks (id,document_id,source_block_id,type,position,data_json) VALUES ('grid-th','home-th','grid','feature_grid',0,'${JSON.stringify({ source: 'organization_updates', title: 'ข่าว', cta_label: 'ข่าวทั้งหมด', cta_url: '/posts' })}')`,
    ...extra,
  ].join(';\n'))
  db.close()
  return path
}

const IDENTITIES = { 'post-sent:facebook': IDENTITY, 'post-sent:instagram': { ...IDENTITY, provider_app_id: 'ig-app', provider_target_id: 'ig-1', provider_permalink: null },
  'post-failed:facebook': IDENTITY, 'fb-post-page-1_2:facebook': IDENTITY }

test('a pre-#1115 export transfers into the social publishing baseline, and unmappable rows fail the preflight', async () => {
  const { transferDatabaseExport, writePayload } = await import('../../scripts/transfer-database-export.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-epoch-'))
  try {
    const targetPath = join(directory, 'target.sqlite')
    const sourcePath = preEpochSource(directory)
    const manifest = transferDatabaseExport(sourcePath, targetPath, { payloadPath: join(directory, 'payload.sql'), publicationIdentities: IDENTITIES })
    const target = new Database(targetPath, { readonly: true })
    const one = (sql: string) => target.prepare(sql).get() as Record<string, unknown>
    const all = (sql: string) => target.prepare(sql).all() as Array<Record<string, unknown>>
    try {
      // The target is exactly what a clean database built from the baseline holds.
      const clean = new Database(':memory:')
      clean.exec(readFileSync('migrations/0000_baseline.sql', 'utf8'))
      const objects = "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
      assert.deepEqual(all(objects), clean.prepare(objects).all())
      clean.close()
      assert.deepEqual(target.pragma('foreign_key_check'), [])

      // Decision 9.1: scheduled content is a draft with everything else intact,
      // and the time it was due is in the report, not in the database.
      assert.deepEqual(all("SELECT id, status, slug, published_at FROM content_documents WHERE id IN ('article-due','post-due') ORDER BY id"), [
        { id: 'article-due', status: 'draft', slug: 'due', published_at: null },
        { id: 'post-due', status: 'draft', slug: 'post-due', published_at: null },
      ])
      assert.deepEqual(manifest.epoch!.scheduled_to_draft, [
        { id: 'article-due', organization_id: 'org', kind: 'article', scheduled_for: '2026-12-01T09:00:00.000Z' },
        { id: 'post-due', organization_id: 'org', kind: 'social_post', scheduled_for: '2026-12-02T09:00:00.000Z' },
      ])
      // 9.2: published posts keep their original publication time.
      assert.deepEqual(one("SELECT status, published_at, first_published_at FROM content_documents WHERE id = 'post-event'"),
        { status: 'published', published_at: '2026-05-01T00:00:00.000Z', first_published_at: '2026-05-01T00:00:00.000Z' })

      // 9.3: the event, offer and alert are words after the original body, in
      // each row's own locale; the metadata keeps only a call to action.
      const words = (id: string) => one(`SELECT summary, metadata_json FROM content_documents WHERE id = '${id}'`)
      const event = words('post-event')
      assert.match(String(event.summary), /^Come hungry\.\n\nEvent Details: Pizza night\n.+ · Friday$/u)
      assert.deepEqual(JSON.parse(String(event.metadata_json)), { call_to_action: { label: 'Call', url: 'tel:+6675000000' } })
      const eventTh = words('post-event-th')
      assert.match(String(eventTh.summary), /^มาหิวๆ\n\nรายละเอียดกิจกรรม: คืนพิซซ่า\n/u)
      assert.equal(eventTh.metadata_json, '{}')
      assert.match(String(words('post-offer').summary), /^Body\n\nEvent Details: Pizza night\n.+\n\nSpecial Offer:\nCode: OVEN10\nhttps:\/\/order\.example\.test\/oven\nDine-in only\.$/u)
      assert.equal(words('post-alert').summary, 'Body\n\nCOVID-19')
      // 9.4: a linked action keeps its destination and the label visitors saw.
      assert.deepEqual(JSON.parse(String(words('post-alert').metadata_json)), { call_to_action: { label: 'Learn more', url: 'https://example.test/safety' } })

      // 9.5-9.6: proven publications carry their identity; pending and failed
      // are unknown with the old error kept; skipped was never one.
      assert.deepEqual(all('SELECT post_id, channel, origin, state, provider_app_id, provider_target_id, provider_post_id, error_code, published_at FROM post_publications ORDER BY post_id, channel'), [
        { post_id: 'fb-post-page-1_2', channel: 'facebook', origin: 'import', state: 'published', provider_app_id: 'fb-app', provider_target_id: 'page-1', provider_post_id: 'page-1_2', error_code: null, published_at: '2026-04-01T00:00:00.000Z' },
        { post_id: 'post-failed', channel: 'facebook', origin: 'publish', state: 'unknown', provider_app_id: 'fb-app', provider_target_id: 'page-1', provider_post_id: null, error_code: 'transfer_failure_unconfirmed', published_at: null },
        { post_id: 'post-sent', channel: 'facebook', origin: 'publish', state: 'published', provider_app_id: 'fb-app', provider_target_id: 'page-1', provider_post_id: 'page-1_1', error_code: null, published_at: '2026-05-01T00:00:01.000Z' },
        { post_id: 'post-sent', channel: 'instagram', origin: 'publish', state: 'unknown', provider_app_id: 'ig-app', provider_target_id: 'ig-1', provider_post_id: null, error_code: 'transfer_pending_unresolved', published_at: null },
      ])
      assert.match(String(one("SELECT error_message FROM post_publications WHERE post_id = 'post-failed'").error_message), /timed out after 10000ms/)
      assert.deepEqual(manifest.epoch!.dropped_channel_entries, [{ id: 'post-failed', channel: 'instagram', status: 'skipped', error: 'Instagram requires an image. Add a photo to this post.' }])
      // 9.7: only the importer's own asset is provider media; the owner's upload on the same post is not.
      assert.deepEqual(all('SELECT id, origin_publication_id IS NOT NULL AS provider FROM media_assets ORDER BY id'), [{ id: 'fb-asset-page-1_2', provider: 1 }, { id: 'owner-upload', provider: 0 }])
      // 9.8: the imported post has a canonical route.
      assert.equal(one("SELECT slug FROM content_documents WHERE id = 'fb-post-page-1_2'").slug, 'imported-from-the-page')

      // 9.9: the feature grid is a social_posts block with its identity, heading
      // and button; its copied rows are gone and the translation follows it.
      assert.deepEqual(all("SELECT id, type, data_json FROM content_blocks ORDER BY id").map(row => ({ ...row, data_json: JSON.parse(String(row.data_json)) })), [
        { id: 'grid', type: 'social_posts', data_json: { title: 'News', limit: 12, call_to_action: { label: 'All news', url: '/posts' } } },
        { id: 'grid-th', type: 'social_posts', data_json: { title: 'ข่าว', limit: 12, call_to_action: { label: 'ข่าวทั้งหมด', url: '/posts' } } },
      ])

      // 9.11: the retired model is gone from the schema.
      assert.equal(one("SELECT count(*) AS n FROM pragma_table_info('content_documents') WHERE name = 'scheduled_for'").n, 0)
      assert.equal(one("SELECT count(*) AS n FROM sqlite_schema WHERE tbl_name = 'content_documents' AND (sql LIKE '%scheduled%' OR sql LIKE '%channels%' OR sql LIKE '%post_type%' OR sql LIKE '%alert_type%')").n, 0)
      // A booking occurrence being scheduled is a different fact, and stays.
      assert.equal(one("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'product_sessions' AND sql LIKE '%''scheduled''%'").n, 1)

      // The initial and final transfers mint the same publication identities, so
      // a delta after the repoint carries only what is new.
      const later = join(directory, 'later.sqlite')
      const source = new Database(sourcePath)
      source.exec(post('post-late', { slug: 'late' }, {}))
      source.close()
      transferDatabaseExport(sourcePath, later, { publicationIdentities: IDENTITIES })
      const laterTarget = new Database(later, { readonly: true })
      const delta = writePayload(laterTarget, join(directory, 'delta.sql'), readFileSync('migrations/0000_baseline.sql', 'utf8'), { deltaFrom: targetPath })
      laterTarget.close()
      assert.deepEqual(Object.fromEntries(Object.entries(delta.delta!).filter(([, rows]) => rows > 0)), { content_documents: 1 })
    } finally {
      target.close()
    }

    // Everything the transfer cannot map is refused by row, and nothing is guessed.
    const refused = (extra: string[], message: RegExp, identities: Record<string, unknown> = IDENTITIES) => assert.throws(
      () => transferDatabaseExport(preEpochSource(directory, extra), join(directory, `refused-${Math.random().toString(36).slice(2)}.sqlite`), { publicationIdentities: identities }), message)
    refused(["UPDATE business_locations SET phone = NULL WHERE id = 'loc'"], /call to action has no resolvable destination[^\n]*\(1\):\n.*"id":"post-event"/)
    refused([], /Channel entries with no verified provider identity[^\n]*\(1\):\n.*"id":"post-sent","organization_id":"org","channel":"instagram","status":"pending"/, { ...IDENTITIES, 'post-sent:instagram': undefined })
    refused(["UPDATE content_documents SET created_by = 'facebook-sync' WHERE id = 'post-sent'"], /import provenance is ambiguous \(1\):\n.*"id":"post-sent"/)
    refused(["UPDATE content_documents SET metadata_json = json_remove(metadata_json, '$.event') WHERE id = 'post-event-th'"], /never carried their event or offer copy \(1\):\n.*"id":"post-event-th"/)
    refused(["UPDATE content_blocks SET data_json = json_set(data_json, '$.limit', 40) WHERE id = 'grid'"], /Social feature grids whose limit or button cannot be carried \(1\):\n.*"id":"grid"/)
    assert.throws(() => transferDatabaseExport(preEpochSource(directory), targetPath), /Target already exists/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
