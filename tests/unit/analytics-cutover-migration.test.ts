import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

function priorDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = OFF')
  for (const file of readdirSync('migrations').filter(file => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) < 136).sort()) {
    try {
      db.exec(readFileSync(`migrations/${file}`, 'utf8'))
    } catch (error) {
      throw new Error(`Could not apply ${file}`, { cause: error })
    }
  }
  db.pragma('foreign_keys = ON')
  return db
}

test('0136 resets only tenant analytics and deterministically backfills explicit favicons', () => {
  const db = priorDatabase()
  const run = (label: string, sql: string, ...params: unknown[]) => {
    try {
      db.prepare(sql).run(...params)
    } catch (error) {
      throw new Error(`Could not seed ${label}`, { cause: error })
    }
  }
  run('organization', 'INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)', 'org-cutover', 'Cutover', 'cutover')
  run('site', 'INSERT INTO sites (id, organization_id, slug, subdomain) VALUES (?, ?, ?, ?)', 'site-cutover', 'org-cutover', 'cutover', 'cutover')
  run('logo asset', "INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, public_url, status) VALUES (?, ?, ?, 'image', 'cloudflare_r2', 'uploaded', ?, 'active')", 'asset-logo', 'org-cutover', 'site-cutover', 'https://assets.example/logo.png')
  run('logo placement', "INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status) VALUES (?, ?, ?, 'site', ?, 'logo', ?, 0, 'active')", 'logo-placement', 'org-cutover', 'site-cutover', 'site-cutover', 'asset-logo')
  run('tenant pageview', "INSERT INTO site_pageview_events (id, site_id, page_path, session_id, visitor_id) VALUES ('page-old', 'site-cutover', '/', 'session-old', 'visitor-old')")
  run('tenant daily aggregate', "INSERT INTO site_analytics_daily (id, site_id, date, page_views) VALUES ('daily-old', 'site-cutover', '2026-08-01', 12)")
  run('tenant conversion', "INSERT INTO site_conversion_events (id, organization_id, site_id, event_name) VALUES ('conversion-old', 'org-cutover', 'site-cutover', 'page_view')")
  run('contact submission', "INSERT INTO contact_submissions (id, organization_id, site_id, name, email, message) VALUES ('contact-keep', 'org-cutover', 'site-cutover', 'Guest', 'guest@playwright.example', 'Keep me')")
  run('operational site event', "INSERT INTO site_events (id, organization_id, site_id, event_type) VALUES ('event-keep', 'org-cutover', 'site-cutover', 'contact.created')")
  run('platform pageview', "INSERT INTO platform_pageview_events (id, page_path) VALUES ('platform-keep', '/')")
  run('platform daily aggregate', "INSERT INTO platform_analytics_daily (id, date, page_views) VALUES ('platform-daily-old', '2026-08-01', 4)")

  const before = Date.now()
  try {
    db.exec(readFileSync('migrations/0136_dashing_robin_chapel.sql', 'utf8'))
  } catch (error) {
    throw new Error('Could not apply analytics cutover migration', { cause: error })
  }
  const after = Date.now()

  for (const table of ['site_pageview_events', 'site_analytics_daily', 'site_conversion_events']) {
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count, 0)
  }
  for (const [table, id] of [['contact_submissions', 'contact-keep'], ['site_events', 'event-keep'], ['platform_pageview_events', 'platform-keep']]) {
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE id = ?`).get(id).count, 1)
  }
  assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type = 'table' AND name = 'platform_analytics_daily'").get().count, 0)
  assert.equal(db.prepare("SELECT asset_id FROM media_placements WHERE owner_type = 'site' AND owner_id = 'site-cutover' AND slot = 'favicon' AND status = 'active'").get().asset_id, 'asset-logo')
  const cutoffValue = String(db.prepare("SELECT analytics_data_start_at cutoff FROM sites WHERE id = 'site-cutover'").get().cutoff)
  const cutoff = Date.parse(cutoffValue)
  assert.ok(cutoff >= before - 1_000 && cutoff <= after + 1_000, `unexpected migration cutoff ${cutoffValue}`)
  assert.equal(db.pragma('foreign_key_check').length, 0)
})
