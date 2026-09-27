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

const PRE_EPOCH_BASELINE = 'tests/integration/fixtures/pre-1083-baseline.sql'
const PAYLOAD = `'{"guest":{"name":"Guest","email":"guest@example.test","phone":null}}'`

/**
 * A database as the pre-#1083 baseline held it: one tenant, a signed-up guest
 * whose customer row links their account, and an unlinked guest known only as
 * a customer, each with the threads, bookings, review request and review that
 * named them through `customers`.
 */
function preEpochSource(directory: string, extra: string[] = []): string {
  const path = join(directory, `source-${Math.random().toString(36).slice(2)}.sqlite`)
  const db = new Database(path)
  db.exec(readFileSync(PRE_EPOCH_BASELINE, 'utf8'))
  db.exec([
    "INSERT INTO organization (id,name,slug,deletionScheduledAt) VALUES ('org','Org','org',1790000000)",
    `UPDATE organization SET integrations_json = '${JSON.stringify({
      google_credential: { revision: 'r', status: 'active', encrypted_access_token: 'enc-a', encrypted_refresh_token: 'enc-r', scopes: 'analytics', provider_account_email: 'owner@example.test' },
      google_analytics: { revision: 'r', status: 'active', measurement_id: 'G-TEST' },
      facebook: { revision: 'r', status: 'active', encrypted_user_token: 'enc-fb', page_id: 'page', page_name: 'Page' },
    })}' WHERE id = 'org'`,
    "INSERT INTO organization_locales (id,organization_id,locale,label,is_source,status) VALUES ('org-en','org','en','English',1,'published')",
    "INSERT INTO user (id,name,email,emailVerified,stripeCustomerId,deletionScheduledAt) VALUES ('owner','Owner','owner@example.test',1,NULL,1790000000)",
    "INSERT INTO user (id,name,email,emailVerified,stripeCustomerId) VALUES ('linked-user','Linked Account Name','linked@example.test',1,'cus_linked')",
    "INSERT INTO member (id,organizationId,userId,role,createdAt) VALUES ('m','org','owner','owner',0)",
    "INSERT INTO business_locations (id,organization_id,slug,title,timezone) VALUES ('loc','org','main','Main','Asia/Bangkok')",
    "INSERT INTO customers (id,organization_id,user_id,stripe_customer_id,name,email,source,created_at,updated_at) VALUES ('cust-linked','org','linked-user','cus_linked','Customer Row Name','other@example.test','booking','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')",
    "INSERT INTO customers (id,organization_id,user_id,stripe_customer_id,name,email,source,review_request_opted_out_at,created_at,updated_at) VALUES ('cust-guest','org',NULL,'cus_guest','  Walk In  ','walkin@example.test','reservation','2026-03-01T00:00:00.000Z','2026-02-01T00:00:00.000Z','2026-02-02T00:00:00.000Z')",
    "INSERT INTO products (id,organization_id,name,slug,created_by,updated_by) VALUES ('product','org','Class','class','t','t')",
    "INSERT INTO product_variants (id,organization_id,product_id,name,created_by,updated_by) VALUES ('variant','org','product','Standard','t','t')",
    "INSERT INTO product_booking_configs (product_id,organization_id,duration_minutes,default_capacity,created_by,updated_by) VALUES ('product','org',60,4,'t','t')",
    "INSERT INTO product_sessions (id,organization_id,product_id,location_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES ('session','org','product','loc','Asia/Bangkok','2099-01-05T03:00:00.000Z','2099-01-05T04:00:00.000Z',4,'scheduled','t','t')",
    `INSERT INTO requests (id,kind,organization_id,location_id,customer_id,conversation_state,payload_json,created_at,updated_at) VALUES ('thread-booking','booking','org','loc','cust-linked','needs_attention',${PAYLOAD},'2026-04-01T00:00:00.000Z','2026-04-01T00:00:00.000Z')`,
    `INSERT INTO requests (id,kind,organization_id,location_id,customer_id,conversation_state,payload_json,created_at,updated_at) VALUES ('thread-reservation','reservation','org','loc','cust-guest','needs_attention',${PAYLOAD},'2026-04-01T00:00:00.000Z','2026-04-01T00:00:00.000Z')`,
    "INSERT INTO bookings (id,organization_id,product_id,product_session_id,product_variant_id,customer_id,request_id,party_size,status) VALUES ('booking','org','product','session','variant','cust-linked','thread-booking',1,'confirmed')",
    "INSERT INTO reservations (id,organization_id,location_id,customer_id,request_id,timezone,starts_at,ends_at,party_size,status) VALUES ('reservation','org','loc','cust-guest','thread-reservation','Asia/Bangkok','2099-01-06T09:00:00.000Z','2099-01-06T11:00:00.000Z',2,'confirmed')",
    "INSERT INTO review_requests (id,organization_id,location_id,customer_id,booking_type,booking_id,token_hash,expires_at) VALUES ('review-request','org','loc','cust-linked','booking','thread-booking','token','2099-02-01T00:00:00.000Z')",
    "INSERT INTO reviews (id,organization_id,location_id,customer_id,review_request_id,rating,status) VALUES ('review','org','loc','cust-guest',NULL,5,'published')",
    "INSERT INTO content_documents (id,organization_id,kind,row_role,locale,title,slug,status,visibility,seo_title,seo_description,canonical_url,metadata_json) VALUES ('article','org','article','root','en','Title','title','published','listed','Override','Override description','https://elsewhere.example/','{}')",
    "INSERT INTO broadcasts (id,content_document_id,category,created_at) VALUES ('broadcast','article','product_news','2026-05-01T00:00:00.000Z')",
    "INSERT INTO broadcast_deliveries (broadcast_id,user_id,status,sent_at) VALUES ('broadcast','linked-user','sent','2026-05-01T00:00:00.000Z')",
    ...extra,
  ].join(';\n'))
  db.close()
  return path
}

test('a pre-epoch export transfers into the #1083 baseline, and inconsistent identity fails the preflight', async () => {
  const { transferDatabaseExport, writePayload } = await import('../../scripts/transfer-database-export.mjs')
  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-epoch-'))
  try {
    const targetPath = join(directory, 'target.sqlite')
    const manifest = transferDatabaseExport(preEpochSource(directory), targetPath, { payloadPath: join(directory, 'payload.sql') })
    const target = new Database(targetPath, { readonly: true })
    const one = (sql: string) => target.prepare(sql).get() as Record<string, unknown>
    const all = (sql: string) => target.prepare(sql).all() as Array<Record<string, unknown>>
    try {
      // 1 and 13: the target is exactly what a clean database built from the
      // baseline holds, object for object.
      const clean = new Database(':memory:')
      clean.exec(readFileSync('migrations/0000_baseline.sql', 'utf8'))
      const objects = "SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
      assert.deepEqual(all(objects), clean.prepare(objects).all())
      clean.close()

      // 3: a linked customer is its user, whose own profile is left as it was.
      assert.deepEqual(one("SELECT name, email, isAnonymous, stripeCustomerId FROM user WHERE id = 'linked-user'"),
        { name: 'Linked Account Name', email: 'linked@example.test', isAnonymous: 0, stripeCustomerId: 'cus_linked' })
      assert.equal(one("SELECT count(*) AS n FROM user WHERE id = 'cust-linked'").n, 0)
      // 4: an unlinked customer becomes one anonymous user under its own id, with no sign-in.
      assert.deepEqual(one("SELECT name, email, emailVerified, phoneNumber, phoneNumberVerified, role, isAnonymous, stripeCustomerId FROM user WHERE id = 'cust-guest'"), {
        name: 'Walk In', email: 'anon-migrated-cust-guest@customers.krabiclaw.local', emailVerified: 0, phoneNumber: null,
        phoneNumberVerified: 0, role: 'user', isAnonymous: 1, stripeCustomerId: 'cus_guest',
      })
      assert.equal(one("SELECT count(*) AS n FROM account WHERE userId = 'cust-guest'").n, 0)
      // 6: the opt-out is the person's review_requests preference.
      assert.deepEqual(all('SELECT user_id, category, email_enabled, whatsapp_enabled, updated_at FROM user_notification_preferences'),
        [{ user_id: 'cust-guest', category: 'review_requests', email_enabled: 0, whatsapp_enabled: 0, updated_at: '2026-03-01T00:00:00.000Z' }])
      // 7: every row that named a customer names that customer's user.
      assert.deepEqual(all(`SELECT 'requests' AS t, id, user_id FROM requests UNION ALL SELECT 'reservations', id, user_id FROM reservations
        UNION ALL SELECT 'bookings', id, user_id FROM bookings UNION ALL SELECT 'review_requests', id, user_id FROM review_requests
        UNION ALL SELECT 'reviews', id, user_id FROM reviews ORDER BY 1, 2`), [
        { t: 'bookings', id: 'booking', user_id: 'linked-user' },
        { t: 'requests', id: 'thread-booking', user_id: 'linked-user' },
        { t: 'requests', id: 'thread-reservation', user_id: 'cust-guest' },
        { t: 'reservations', id: 'reservation', user_id: 'cust-guest' },
        { t: 'review_requests', id: 'review-request', user_id: 'linked-user' },
        { t: 'reviews', id: 'review', user_id: 'cust-guest' },
      ])
      // The guest's own words stay on the thread, unchanged.
      assert.equal(one("SELECT payload_json FROM requests WHERE id = 'thread-booking'").payload_json, PAYLOAD.slice(1, -1))
      // 8: nothing was archived by moving it.
      assert.deepEqual(all('SELECT archived_at, archived_by_user_id FROM requests'), [{ archived_at: null, archived_by_user_id: null }, { archived_at: null, archived_by_user_id: null }])
      // 9 and 11: retired storage is gone and its rows were not copied anywhere.
      assert.equal(one("SELECT count(*) AS n FROM sqlite_schema WHERE name IN ('customers', 'broadcast_deliveries')").n, 0)
      assert.deepEqual(manifest.retired_tables, [{ table: 'broadcast_deliveries', source_rows: 1 }, { table: 'customers', source_rows: 2 }])
      assert.deepEqual(all("SELECT name FROM pragma_table_info('content_documents') WHERE name IN ('seo_title','seo_description','canonical_url','seo_keywords')"), [{ name: 'seo_keywords' }])
      assert.equal(one("SELECT count(*) AS n FROM pragma_table_info('user') WHERE name = 'deletionScheduledAt'").n, 0)
      // #1087: a token the organization held cannot become a Better Auth linked
      // account, so the connection goes, the owner is named, and the
      // selection-only analytics key stays.
      assert.deepEqual(JSON.parse(String(one("SELECT integrations_json FROM organization WHERE id = 'org'").integrations_json)),
        { google_analytics: { revision: 'r', status: 'active', measurement_id: 'G-TEST' } })
      assert.deepEqual(manifest.connections_to_reconnect, [{ organization_id: 'org', slug: 'org', name: 'Org', connections: ['google', 'facebook'] }])
      // 10: an existing broadcast has not been created at Resend yet.
      assert.deepEqual(all('SELECT id, provider_broadcast_id FROM broadcasts'), [{ id: 'broadcast', provider_broadcast_id: null }])
      // 12
      assert.deepEqual(target.pragma('foreign_key_check'), [])
      // Every surviving table's rows are accounted for.
      assert.deepEqual(manifest.tables.filter(entry => entry.source_rows !== entry.target_rows),
        [{ table: 'user', source_rows: 2, target_rows: 3 }, { table: 'user_notification_preferences', source_rows: 0, target_rows: 1 }])

      // A guest who books after the export arrives in the delta, and only they do.
      const later = join(directory, 'later.sqlite')
      transferDatabaseExport(preEpochSource(directory, [
        "INSERT INTO customers (id,organization_id,name,source,created_at,updated_at) VALUES ('cust-late','org','Late','contact','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z')",
        `INSERT INTO requests (id,kind,organization_id,customer_id,conversation_state,payload_json,created_at,updated_at) VALUES ('thread-late','contact','org','cust-late','needs_attention','{"guest":{"name":"Late","email":"late@example.test","phone":null},"message":"hi"}','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z')`,
      ]), later)
      const laterTarget = new Database(later, { readonly: true })
      const delta = writePayload(laterTarget, join(directory, 'delta.sql'), readFileSync('migrations/0000_baseline.sql', 'utf8'), { deltaFrom: targetPath })
      laterTarget.close()
      assert.deepEqual(Object.fromEntries(Object.entries(delta.delta!).filter(([, rows]) => rows > 0)), { requests: 1, user: 1 })
    } finally {
      target.close()
    }

    // The transfer refuses a target that already exists rather than adding to it.
    assert.throws(() => transferDatabaseExport(preEpochSource(directory), targetPath), /Target already exists/)

    // 5 and the other identity conflicts: nothing is chosen, and every offending row is named.
    const refused = (extra: string[], message: RegExp) => assert.throws(
      () => transferDatabaseExport(preEpochSource(directory, extra), join(directory, `refused-${Math.random().toString(36).slice(2)}.sqlite`)), message)
    refused(["UPDATE user SET stripeCustomerId = 'cus_other' WHERE id = 'linked-user'"], /People with more than one Stripe customer \(2\):\n.*"source":"customers\.stripe_customer_id","row_id":"cust-linked","stripe_customer_id":"cus_linked"\}\n.*"source":"user\.stripeCustomerId","row_id":"linked-user","stripe_customer_id":"cus_other"\}/)
    refused(["INSERT INTO customers (id,organization_id,source,created_at,updated_at) VALUES ('cust-idle','org','import','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')"],
      /Customers no domain row of their own organization refers to \(1\):[\s\S]*"id":"cust-idle","organization_id":"org","source":"import","created_at":"2026-01-01T00:00:00.000Z"/)
    refused(["INSERT INTO user (id,name,email) VALUES ('cust-guest','Someone Else','someone@example.test')"], /Unlinked customers whose id already belongs to an unrelated Better Auth user \(1\)/)
    refused(["UPDATE reviews SET user_id = 'owner' WHERE id = 'review'"], /Reviews whose customer and user disagree \(1\)/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
