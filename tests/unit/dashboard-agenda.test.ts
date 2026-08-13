import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []) {
  return db.prepare(query).all(...params) as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll, queryFirst: async () => null, execute: async () => ({}), schema: {} },
})

const { listAgenda } = await import('../../server/utils/dashboard-agenda.ts')

function createDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE sites (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, brand_name TEXT, subdomain TEXT,
      vertical TEXT NOT NULL, theme_id TEXT NOT NULL, feature_overrides TEXT,
      primary_location_id TEXT, team_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE business_locations (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      slug TEXT NOT NULL, title TEXT NOT NULL, timezone TEXT, team_id TEXT
    );
    CREATE TABLE reservation_submissions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      location_id TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      guests TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE experience_bookings (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      location_id TEXT NOT NULL, guest_name TEXT NOT NULL, booking_date TEXT NOT NULL,
      time_slot TEXT NOT NULL, party_size INTEGER NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE posts (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      location_id TEXT, title TEXT, event_title TEXT, post_type TEXT NOT NULL, status TEXT NOT NULL,
      scheduled_for TEXT, published_at TEXT, event_start TEXT, event_end TEXT
    );
    CREATE TABLE guest_threads (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      location_id TEXT, submission_type TEXT NOT NULL, submission_id TEXT NOT NULL,
      guest_name TEXT NOT NULL, conversation_state TEXT NOT NULL,
      last_inbound_at TEXT, last_message_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE member (id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, userId TEXT NOT NULL);
    CREATE TABLE teamMember (id TEXT PRIMARY KEY, teamId TEXT NOT NULL, userId TEXT NOT NULL);
  `)
  return db
}

function seedAgenda(db: SqliteDb) {
  db.prepare(`INSERT INTO sites VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'site-a', 'org-a', 'Bangkok Kitchen', 'bangkok-kitchen', 'restaurant', 'saya-theme-v1',
    JSON.stringify({ enabled: ['experiences'] }), 'location-a', null, '2026-01-01T00:00:00Z',
  )
  db.prepare(`INSERT INTO business_locations VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'location-a', 'org-a', 'site-a', 'riverside', 'Riverside', 'Asia/Bangkok', null,
  )
  db.prepare(`INSERT INTO reservation_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'reservation-a', 'org-a', 'site-a', 'location-a', 'Ari', '2026-08-13', '00:30', '2', 'new',
  )
  db.prepare(`INSERT INTO experience_bookings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'booking-a', 'org-a', 'site-a', 'location-a', 'Bo', '2026-08-13', '09:00', 3, 'pending',
  )
  db.prepare(`INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'post-a', 'org-a', 'site-a', 'location-a', 'Dinner post', null, 'standard', 'scheduled',
    '2026-08-12T18:00:00Z', null, null, null,
  )
  db.prepare(`INSERT INTO guest_threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'thread-reservation', 'org-a', 'site-a', 'location-a', 'reservation', 'reservation-a',
    'Ari', 'needs_attention', '2026-08-12T17:00:00Z', '2026-08-12T17:00:00Z', '2026-08-12T17:00:00Z',
  )
  db.prepare(`INSERT INTO guest_threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'thread-a', 'org-a', 'site-a', 'location-a', 'contact', 'contact-a',
    'Cee', 'needs_attention', '2026-08-12T20:00:00Z', '2026-08-12T20:00:00Z', '2026-08-12T20:00:00Z',
  )
  db.prepare(`INSERT INTO reservation_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'reservation-other', 'org-b', 'site-a', 'location-a', 'Other org', '2026-08-13', '10:00', '9', 'new',
  )
}

test('listAgenda merges all sources, sorts chronologically, enforces organization, and preserves local day across UTC midnight', async () => {
  const db = createDb()
  seedAgenda(db)
  const result = await listAgenda(db as never, 'org-a', {
    from: '2026-08-13', to: '2026-08-13', organizationSlug: 'acme',
    principal: { memberId: 'member-owner', role: 'owner' },
  })

  assert.deepEqual(result.items.map(item => item.kind), ['thread', 'reservation', 'post', 'thread', 'experience_booking'])
  assert.equal(result.items.every(item => item.dayKey === '2026-08-13'), true)
  const reservation = result.items.find(item => item.id === 'reservation:reservation-a')
  assert.equal(reservation?.startsAt, '2026-08-12T17:30:00.000Z')
  assert.equal(reservation?.timeZone, 'Asia/Bangkok')
  assert.equal(reservation?.showTimeZone, false)
  assert.equal(reservation?.to, '/dashboard/acme/sites/bangkok-kitchen/conversations/thread-reservation')
  assert.equal(result.items.some(item => item.title === 'Other org'), false)
})

test('listAgenda treats from and to as inclusive local-day boundaries', async () => {
  const db = createDb()
  seedAgenda(db)
  const included = await listAgenda(db as never, 'org-a', { from: '2026-08-13', to: '2026-08-13', kinds: ['reservation'] })
  const excluded = await listAgenda(db as never, 'org-a', { from: '2026-08-14', to: '2026-08-14', kinds: ['reservation'] })
  assert.equal(included.items.length, 1)
  assert.equal(excluded.items.length, 0)
})

test('listAgenda capability gating omits booking kinds unsupported by every site', async () => {
  const db = createDb()
  db.prepare(`INSERT INTO sites VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'site-service', 'org-service', 'Service Co', 'service-co', 'service', 'blawby-theme-v1',
    null, null, null, '2026-01-01T00:00:00Z',
  )
  const result = await listAgenda(db as never, 'org-service', { from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual(result.availableKinds, ['post', 'thread'])
})

test('listAgenda applies an editor member scope inside every source query', async () => {
  const db = createDb()
  seedAgenda(db)
  db.prepare('UPDATE sites SET team_id = ? WHERE id = ?').run('team-site-a', 'site-a')
  db.prepare('UPDATE business_locations SET team_id = ? WHERE id = ?').run('team-location-a', 'location-a')
  db.prepare('INSERT INTO member VALUES (?, ?, ?)').run('member-editor', 'org-a', 'user-editor')
  db.prepare('INSERT INTO teamMember VALUES (?, ?, ?)').run('team-member-location', 'team-location-a', 'user-editor')
  db.prepare('INSERT INTO business_locations VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'location-hidden', 'org-a', 'site-a', 'hidden', 'Hidden location', 'Asia/Bangkok', 'team-location-hidden',
  )
  db.prepare('INSERT INTO reservation_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'reservation-hidden', 'org-a', 'site-a', 'location-hidden', 'Hidden guest', '2026-08-13', '11:00', '4', 'new',
  )

  const result = await listAgenda(db as never, 'org-a', {
    from: '2026-08-13', to: '2026-08-13', kinds: ['reservation'],
    principal: { memberId: 'member-editor', role: 'editor' },
  })
  assert.deepEqual(result.items.map(item => item.title), ['Ari'])
  assert.deepEqual(result.locations.map(location => location.id), ['location-a'])
})
