import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('0060 preserves editor access and converts scoped members and invitations', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL
    );
    CREATE TABLE member_access_scope (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      location_id TEXT
    );
    CREATE UNIQUE INDEX idx_member_access_scope_unique
      ON member_access_scope (member_id, site_id, location_id);
    CREATE UNIQUE INDEX idx_member_access_scope_site_unique
      ON member_access_scope (member_id, site_id) WHERE location_id IS NULL;
    CREATE TABLE invitation (
      id TEXT PRIMARY KEY,
      organizationId TEXT NOT NULL,
      status TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE invitation_access_scope (
      id TEXT PRIMARY KEY,
      invitation_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      location_id TEXT
    );
    CREATE UNIQUE INDEX idx_invitation_access_scope_unique
      ON invitation_access_scope (invitation_id, site_id, location_id);
    CREATE UNIQUE INDEX idx_invitation_access_scope_site_unique
      ON invitation_access_scope (invitation_id, site_id) WHERE location_id IS NULL;

    INSERT INTO sites VALUES ('site-1', 'org-1'), ('site-2', 'org-1');
    INSERT INTO member VALUES
      ('existing-editor', 'org-1', 'editor'),
      ('location-manager', 'org-1', 'location_manager');
    INSERT INTO member_access_scope VALUES
      ('editor-location-scope', 'existing-editor', 'org-1', 'site-1', 'loc-1'),
      ('manager-location-scope', 'location-manager', 'org-1', 'site-1', 'loc-1');
    INSERT INTO invitation VALUES
      ('legacy-invitation', 'org-1', 'pending', 'location_manager'),
      ('editor-invitation', 'org-1', 'pending', 'editor'),
      ('unscoped-editor-invitation', 'org-1', 'pending', 'editor');
    INSERT INTO invitation_access_scope VALUES
      ('legacy-scope', 'legacy-invitation', 'org-1', 'site-1', 'loc-1'),
      ('editor-scope', 'editor-invitation', 'org-1', 'site-1', NULL);
  `)

  db.exec(readFileSync('migrations/0060_moaning_sersi.sql', 'utf8').replaceAll('--> statement-breakpoint', ''))

  assert.deepEqual(
    db.prepare('SELECT id, role FROM member ORDER BY id').all().map(row => ({ ...row })),
    [
      { id: 'existing-editor', role: 'editor' },
      { id: 'location-manager', role: 'editor' },
    ],
  )
  assert.deepEqual(
    db.prepare(`
      SELECT site_id, location_id, grant_source
      FROM member_access_scope
      WHERE member_id = 'existing-editor'
      ORDER BY site_id, location_id
    `).all().map(row => ({ ...row })),
    [
      { site_id: 'site-1', location_id: null, grant_source: 'migration_backfill' },
      { site_id: 'site-1', location_id: 'loc-1', grant_source: 'manual' },
      { site_id: 'site-2', location_id: null, grant_source: 'migration_backfill' },
    ],
  )
  assert.deepEqual(
    db.prepare(`
      SELECT site_id, location_id, grant_source
      FROM member_access_scope
      WHERE member_id = 'location-manager'
    `).all().map(row => ({ ...row })),
    [{ site_id: 'site-1', location_id: 'loc-1', grant_source: 'whatsapp_config' }],
  )
  assert.deepEqual(
    db.prepare('SELECT id, role FROM invitation ORDER BY id').all().map(row => ({ ...row })),
    [
      { id: 'editor-invitation', role: 'editor' },
      { id: 'legacy-invitation', role: 'editor' },
      { id: 'unscoped-editor-invitation', role: 'editor' },
    ],
  )
  assert.deepEqual(
    db.prepare('SELECT invitation_id, site_id, grant_source FROM invitation_access_scope ORDER BY invitation_id, site_id').all().map(row => ({ ...row })),
    [
      { invitation_id: 'editor-invitation', site_id: 'site-1', grant_source: 'manual' },
      { invitation_id: 'editor-invitation', site_id: 'site-2', grant_source: 'migration_backfill' },
      { invitation_id: 'legacy-invitation', site_id: 'site-1', grant_source: 'whatsapp_config' },
      { invitation_id: 'unscoped-editor-invitation', site_id: 'site-1', grant_source: 'migration_backfill' },
      { invitation_id: 'unscoped-editor-invitation', site_id: 'site-2', grant_source: 'migration_backfill' },
    ],
  )
  db.close()
})
