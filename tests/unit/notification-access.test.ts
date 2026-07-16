import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { buildNotificationVisibilityFilter, type NotificationVisibilityPrincipal } from '../../server/utils/notification-access.ts'

function setupDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      site_id TEXT,
      location_id TEXT,
      scope TEXT NOT NULL,
      event_type TEXT,
      target_user_id TEXT,
      channel TEXT NOT NULL,
      read_at TEXT
    );
    CREATE TABLE member_access_scope (
      member_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      location_id TEXT
    );
    CREATE TABLE notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (notification_id, user_id)
    );
  `)
  const insert = db.prepare(`
    INSERT INTO notifications
    (id, organization_id, site_id, location_id, scope, event_type, target_user_id, channel, read_at)
    VALUES (?, ?, ?, ?, ?, 'test.event', NULL, 'dashboard', NULL)
  `)
  insert.run('platform', null, null, null, 'platform')
  insert.run('organization', 'org-1', null, null, 'organization')
  insert.run('site-wide', 'org-1', 'site-1', null, 'site')
  insert.run('location-a', 'org-1', 'site-1', 'location-a', 'site')
  insert.run('location-b', 'org-1', 'site-1', 'location-b', 'site')
  insert.run('other-org', 'org-2', 'site-2', null, 'site')
  return db
}

function idsFor(db: DatabaseSync, principal: NotificationVisibilityPrincipal) {
  const filter = buildNotificationVisibilityFilter(principal)
  return db.prepare(`SELECT n.id FROM notifications n WHERE ${filter.whereSql} ORDER BY n.id`)
    .all(...filter.whereParams as never[])
    .map(row => String(row.id))
}

test('location-scoped notification visibility applies to list, count, and mark-all', () => {
  const db = setupDatabase()
  db.prepare(`INSERT INTO member_access_scope VALUES ('member-location-a', 'org-1', 'site-1', 'location-a')`).run()
  const principal: NotificationVisibilityPrincipal = {
    userId: 'user-location-a',
    platformAdmin: false,
    organization: { id: 'org-1', role: 'staff', memberId: 'member-location-a' },
  }
  const filter = buildNotificationVisibilityFilter(principal)

  assert.deepEqual(idsFor(db, principal), ['location-a'])
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM notifications n WHERE ${filter.whereSql}`)
    .get(...filter.whereParams as never[])?.count, 1)

  db.prepare(`
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    SELECT n.id, ?, '2026-07-16T00:00:00.000Z'
    FROM notifications n
    WHERE ${filter.whereSql}
  `).run(principal.userId, ...filter.whereParams as never[])

  assert.deepEqual(db.prepare(`SELECT notification_id FROM notification_reads ORDER BY notification_id`)
    .all().map(row => String(row.notification_id)), ['location-a'])
  db.close()
})

test('whole-site access includes null and concrete locations while a location scope excludes site-wide rows', () => {
  const db = setupDatabase()
  db.prepare(`INSERT INTO member_access_scope VALUES ('member-site', 'org-1', 'site-1', NULL)`).run()

  assert.deepEqual(idsFor(db, {
    userId: 'user-site',
    platformAdmin: false,
    organization: { id: 'org-1', role: 'staff', memberId: 'member-site' },
  }), ['location-a', 'location-b', 'site-wide'])
  db.close()
})

test('platform admin visibility does not require a tenant organization', () => {
  const db = setupDatabase()
  assert.deepEqual(idsFor(db, { userId: 'platform-admin', platformAdmin: true, organization: null }), ['platform'])
  assert.deepEqual(idsFor(db, { userId: 'unaffiliated-user', platformAdmin: false, organization: null }), [])
  db.close()
})
