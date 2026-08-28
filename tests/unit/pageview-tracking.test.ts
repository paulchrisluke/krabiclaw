import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import test from 'node:test'
import {
  isKnownBot,
  isKnownTenantPublicPath,
  isTrackablePath,
  recordTenantPageview,
  updateTenantPageviewDuration,
} from '../../server/utils/pageview-tracking.ts'

function analyticsDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE site_analytics_sessions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL,
      session_id TEXT NOT NULL, visitor_id TEXT NOT NULL, started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL, landing_path TEXT NOT NULL, duration_seconds INTEGER DEFAULT 0,
      last_touch_source TEXT NOT NULL, last_touch_medium TEXT NOT NULL,
      last_touch_campaign TEXT, last_touch_term TEXT, last_touch_content TEXT,
      last_touch_referrer_host TEXT, last_touch_gclid TEXT, last_touch_gbraid TEXT,
      last_touch_wbraid TEXT, last_touch_fbclid TEXT, last_touch_msclkid TEXT,
      last_touch_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(site_id, session_id)
    );
    CREATE TABLE site_pageview_events (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL, location_id TEXT, page_path TEXT NOT NULL,
      page_id TEXT, page_type TEXT, recipe TEXT, locale TEXT, revision_id TEXT,
      referrer TEXT, user_agent TEXT, ip_hash TEXT, session_id TEXT, visitor_id TEXT,
      duration_seconds INTEGER, country TEXT, region TEXT, city TEXT, created_at TEXT NOT NULL
    );
  `)

  const raw = {
    prepare(query: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              const result = sqlite.prepare(query).run(...params)
              return { meta: { changes: result.changes } }
            },
          }
        },
      }
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      return results
    },
  }
  return { sqlite, raw }
}

const base = {
  organizationId: 'org', siteId: 'site', pagePath: '/', locale: 'en', referrerHost: null,
  internalHosts: ['tenant.example'], userAgent: 'Mozilla/5.0', ipHash: 'hash',
  sessionId: '11111111-1111-4111-8111-111111111111',
  visitorId: '22222222-2222-4222-8222-222222222222',
  country: 'US', region: 'IL', city: 'Chicago', locationId: null, pageId: null,
  pageType: null, recipe: null,
}

test('recognized touches replace nullable fields and a duplicate event retry cannot roll attribution back', async () => {
  const { sqlite, raw } = analyticsDb()
  await recordTenantPageview(raw as never, {
    ...base,
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    attribution: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'launch' },
    now: '2026-01-01T00:00:00.000Z',
  })
  await recordTenantPageview(raw as never, {
    ...base,
    eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    attribution: { gclid: 'google-click' },
    now: '2026-01-01T00:01:00.000Z',
  })

  let session = sqlite.prepare('SELECT * FROM site_analytics_sessions').get() as Record<string, unknown>
  assert.equal(session.last_touch_source, 'Google')
  assert.equal(session.last_touch_medium, 'paid')
  assert.equal(session.last_touch_campaign, null)
  assert.equal(session.last_touch_gclid, 'google-click')

  await recordTenantPageview(raw as never, {
    ...base,
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    attribution: { utm_source: 'stale', utm_campaign: 'old' },
    now: '2026-01-01T00:02:00.000Z',
  })
  session = sqlite.prepare('SELECT * FROM site_analytics_sessions').get() as Record<string, unknown>
  assert.equal(session.last_touch_source, 'Google')
  assert.equal(session.last_touch_campaign, null)
  assert.equal(session.last_seen_at, '2026-01-01T00:01:00.000Z')
  assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM site_pageview_events').get().count, 2)
})

test('duration updates the exact event and ignores unknown IDs without extending the session', async () => {
  const { sqlite, raw } = analyticsDb()
  for (const [eventId, now] of [
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-01-01T00:00:00.000Z'],
    ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-01-01T00:01:00.000Z'],
  ]) {
    await recordTenantPageview(raw as never, { ...base, eventId, attribution: {}, now })
  }
  await updateTenantPageviewDuration(raw as never, {
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', siteId: base.siteId,
    sessionId: base.sessionId, durationSeconds: 17, now: '2026-01-01T00:02:00.000Z',
  })
  assert.deepEqual(sqlite.prepare('SELECT id, duration_seconds FROM site_pageview_events ORDER BY id').all(), [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', duration_seconds: 17 },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', duration_seconds: null },
  ])
  const before = sqlite.prepare('SELECT last_seen_at FROM site_analytics_sessions').get().last_seen_at
  await updateTenantPageviewDuration(raw as never, {
    eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', siteId: base.siteId,
    sessionId: base.sessionId, durationSeconds: 99, now: '2026-01-01T00:03:00.000Z',
  })
  assert.equal(sqlite.prepare('SELECT last_seen_at FROM site_analytics_sessions').get().last_seen_at, before)
  assert.equal(sqlite.prepare('SELECT duration_seconds FROM site_analytics_sessions').get().duration_seconds, 17)
})

test('tracking boundaries reject private/assets/unknown probes and known bots', () => {
  assert.equal(isTrackablePath('/api/private'), false)
  assert.equal(isTrackablePath('/favicon.ico'), false)
  assert.equal(isTrackablePath('/dashboard/org'), false)
  assert.equal(isTrackablePath('/public-page'), true)
  assert.equal(isKnownTenantPublicPath('/experiences/pottery'), true)
  assert.equal(isKnownTenantPublicPath('/services/family', { themeId: 'blawby-theme-v1' }), true)
  assert.equal(isKnownTenantPublicPath('/article/writing-your-own-will', { themeId: 'blawby-theme-v1' }), true)
  assert.equal(isKnownTenantPublicPath('/services/family', { themeId: 'saya-theme-v1' }), false)
  assert.equal(isKnownTenantPublicPath('/contact/confirmed', { themeId: 'saya-theme-v1' }), true)
  assert.equal(isKnownTenantPublicPath('/contact/confirmed', { themeId: 'blawby-theme-v1' }), true)
  assert.equal(isKnownTenantPublicPath('/reservations/confirmed', { themeId: 'saya-theme-v1' }), true)
  assert.equal(isKnownTenantPublicPath('/reservations/confirmed', { themeId: 'blawby-theme-v1' }), false)
  assert.equal(isKnownTenantPublicPath('/unknown-probe'), false)
  assert.equal(isKnownBot('Googlebot/2.1'), true)
  assert.equal(isKnownBot('Mozilla/5.0 Chrome/140'), false)
})
