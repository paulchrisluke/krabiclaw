import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

import { getPlanEntitlements } from '../../server/utils/billing-entitlements.ts'

type BatchQuery = { query: string; params?: unknown[] }

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async () => null,
    queryAll: async () => [],
    execute: async () => ({ meta: { changes: 1 } }),
    executeBatch: async () => [],
  },
})
mock.module('../../server/utils/organization-billing.ts', {
  namedExports: {
    validateOrganizationBillingProjection: () => ({
      effectivePlan: 'growth',
      entitlements: getPlanEntitlements('growth'),
    }),
  },
})
mock.module('../../server/utils/domains.ts', {
  namedExports: {
    createCustomDomainPair: async () => undefined,
    deleteCustomDomain: async () => undefined,
  },
})
mock.module('../../server/utils/site-transfer-notifications.ts', {
  namedExports: { notifySiteTransferReminder: async () => undefined },
})

const { buildSiteTransferMutationBatch } = await import('../../server/utils/site-transfer.ts?media-cluster')

const SOURCE_ORG = 'org-source'
const RECIPIENT_ORG = 'org-recipient'
const SITE_ID = 'site-transfer'
const TRANSFER_ID = 'transfer-media-1'
const NOW = '2026-08-08T00:00:00.000Z'

function createSchema(db: Database.Database) {
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE organization_billing (
      organization_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_subscription_item_id TEXT,
      status TEXT,
      plan TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      last_paid_invoice_id TEXT,
      last_payment_event_created INTEGER,
      last_payment_event_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE team (id TEXT PRIMARY KEY, organizationId TEXT);
    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id),
      plan TEXT,
      team_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE media_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      location_id TEXT,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      source TEXT NOT NULL,
      cloudflare_image_id TEXT,
      r2_key TEXT,
      google_media_name TEXT,
      public_url TEXT,
      thumbnail_url TEXT,
      mime_type TEXT,
      file_name TEXT,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      duration INTEGER,
      alt_text TEXT,
      category TEXT,
      status TEXT,
      created_by_user_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      delete_pending_at TEXT
    );
    CREATE UNIQUE INDEX media_assets_org_site_id_unique ON media_assets(organization_id, site_id, id);
    CREATE TABLE business_locations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      slug TEXT,
      hero_media_asset_id TEXT,
      og_image_asset_id TEXT,
      notification_phone TEXT,
      team_id TEXT
    );
    CREATE TABLE experiences (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id),
      site_id TEXT NOT NULL REFERENCES sites(id),
      location_id TEXT NOT NULL REFERENCES business_locations(id),
      og_image_asset_id TEXT
    );
    CREATE UNIQUE INDEX experiences_org_site_id_unique ON experiences(organization_id, site_id, id);
    CREATE TABLE experience_media (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      experience_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      FOREIGN KEY (organization_id, site_id, experience_id)
        REFERENCES experiences(organization_id, site_id, id),
      FOREIGN KEY (organization_id, site_id, asset_id)
        REFERENCES media_assets(organization_id, site_id, id)
    );
    CREATE TABLE menus (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT);
    CREATE TABLE menu_items (id TEXT PRIMARY KEY, menu_id TEXT REFERENCES menus(id));
    CREATE TABLE menu_item_media (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
      asset_id TEXT NOT NULL,
      FOREIGN KEY (organization_id, site_id, asset_id)
        REFERENCES media_assets(organization_id, site_id, id)
    );
    CREATE TABLE posts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      title TEXT
    );
    CREATE TABLE blog_posts (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      site_id TEXT,
      title TEXT NOT NULL
    );
    CREATE TABLE post_channel_jobs (id TEXT PRIMARY KEY, organization_id TEXT, post_id TEXT);
    CREATE TABLE tenant_pages (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, site_id TEXT NOT NULL, path TEXT);
    CREATE TABLE tenant_page_variants (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      page_id TEXT NOT NULL REFERENCES tenant_pages(id),
      locale TEXT NOT NULL
    );
    CREATE TABLE site_config (
      organization_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT,
      PRIMARY KEY (organization_id, site_id, key)
    );
    CREATE TABLE site_billing (
      id TEXT PRIMARY KEY,
      site_id TEXT UNIQUE NOT NULL,
      organization_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      stripe_subscription_item_id TEXT UNIQUE,
      plan TEXT,
      status TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      last_paid_invoice_id TEXT,
      last_payment_event_created INTEGER,
      last_payment_event_id TEXT,
      updated_at TEXT,
      payment_method TEXT
    );
    CREATE TABLE site_entitlements (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE (site_id, key)
    );
    CREATE TABLE site_transfer_requests (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      from_organization_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE dashboard_preferences (id TEXT PRIMARY KEY, selected_location_id TEXT);
    CREATE TABLE member (id TEXT PRIMARY KEY, userId TEXT, organizationId TEXT);
    CREATE TABLE chowbot_channel_state (
      user_id TEXT PRIMARY KEY,
      selected_site_id TEXT,
      active_conversation_id TEXT,
      pending_media TEXT,
      pending_confirmation TEXT
    );
    CREATE TABLE chowbot_conversations (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT);
    CREATE TABLE invitation_access_scope (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT, location_id TEXT);
    CREATE TABLE facebook_pages_connections (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT, encrypted_user_token TEXT);
    CREATE TABLE google_analytics_connections (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT, encrypted_access_token TEXT, encrypted_refresh_token TEXT);
    CREATE TABLE mcp_workspace_preferences (
      user_id TEXT PRIMARY KEY,
      organization_id TEXT,
      site_id TEXT,
      location_id TEXT,
      updated_at TEXT
    );
  `)

  const reparent = [
    'customers', 'customer_claims', 'business_location_translations', 'contact_submissions',
    'guest_threads', 'guest_thread_entries', 'guest_thread_commands', 'experience_bookings',
    'experience_slot_overrides', 'location_qa', 'menu_item_translations', 'menu_translations',
    'site_authors', 'post_translations', 'post_media', 'reservation_slot_overrides',
    'reservation_submissions', 'booking_policies', 'review_requests', 'reviews', 'offerings',
    'site_link_pages', 'site_link_items', 'tenant_compliance', 'site_consultation_settings',
    'site_theme_tokens', 'tenant_navigation_items', 'tenant_redirects', 'site_conversion_events',
    'site_domain_events', 'site_domains', 'site_events', 'site_locales', 'work_requests',
  ]
  const retain = [
    'ai_usage_log', 'usage_events', 'stripe_ga4_subscription_intents', 'canary_runs',
    'mcp_tool_call_events', 'notification_events', 'notifications',
    'client_import_artifacts', 'chowbot_messages',
  ]
  for (const table of [...reparent, ...retain]) {
    db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, organization_id TEXT, site_id TEXT)`)
  }

  db.exec(`
    CREATE TRIGGER media_assets_scope_update
    BEFORE UPDATE OF organization_id, site_id ON media_assets
    FOR EACH ROW
    WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.site_id IS NOT OLD.site_id
    BEGIN
      SELECT RAISE(ABORT, 'media scope mismatch') WHERE EXISTS (
        SELECT 1 FROM business_locations
        WHERE (hero_media_asset_id = OLD.id OR og_image_asset_id = OLD.id)
          AND (organization_id != NEW.organization_id OR site_id != NEW.site_id)
      );
      SELECT RAISE(ABORT, 'experience media scope mismatch') WHERE EXISTS (
        SELECT 1 FROM experience_media
        WHERE asset_id = OLD.id
          AND (organization_id != NEW.organization_id OR site_id != NEW.site_id)
      );
      SELECT RAISE(ABORT, 'experience og scope mismatch') WHERE EXISTS (
        SELECT 1 FROM experiences
        WHERE og_image_asset_id = OLD.id
          AND (organization_id != NEW.organization_id OR site_id != NEW.site_id)
      );
    END;
    CREATE TRIGGER business_locations_hero_media_scope_update
    BEFORE UPDATE OF organization_id, site_id, hero_media_asset_id ON business_locations
    FOR EACH ROW
    WHEN NEW.hero_media_asset_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM media_assets WHERE organization_id = NEW.organization_id
        AND site_id = NEW.site_id AND id = NEW.hero_media_asset_id
    )
    BEGIN SELECT RAISE(ABORT, 'location hero scope mismatch'); END;
    CREATE TRIGGER business_locations_og_image_scope_update
    BEFORE UPDATE OF organization_id, site_id, og_image_asset_id ON business_locations
    FOR EACH ROW
    WHEN NEW.og_image_asset_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM media_assets WHERE organization_id = NEW.organization_id
        AND site_id = NEW.site_id AND id = NEW.og_image_asset_id
    )
    BEGIN SELECT RAISE(ABORT, 'location og scope mismatch'); END;
    CREATE TRIGGER blog_posts_scope_org_site_update
    BEFORE UPDATE OF organization_id, site_id ON blog_posts
    FOR EACH ROW
    WHEN NEW.organization_id IS NOT NULL AND NEW.site_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sites WHERE id = NEW.site_id AND organization_id = NEW.organization_id)
    BEGIN SELECT RAISE(ABORT, 'blog scope mismatch'); END;
  `)
}

function seedFixture(db: Database.Database) {
  db.exec(`
    INSERT INTO organization(id) VALUES ('${SOURCE_ORG}'), ('${RECIPIENT_ORG}');
    INSERT INTO organization_billing(
      organization_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id,
      status, plan, current_period_end, cancel_at_period_end, payment_status, paid_through,
      past_due_since, last_paid_invoice_id, last_payment_event_created, last_payment_event_id, updated_at
    ) VALUES ('${RECIPIENT_ORG}', 'cus-recipient', 'sub-recipient', 'si-recipient', 'active', 'growth',
      '2026-09-01T00:00:00.000Z', 0, 'paid', '2026-09-01T00:00:00.000Z', NULL, 'in-1', 1, 'evt-1', '${NOW}');
    INSERT INTO team(id, organizationId) VALUES ('team-source', '${SOURCE_ORG}');
    INSERT INTO sites(id, organization_id, plan, team_id, updated_at)
      VALUES ('${SITE_ID}', '${SOURCE_ORG}', 'growth', 'team-source', 'before');
    INSERT INTO business_locations(id, organization_id, site_id, slug, hero_media_asset_id, og_image_asset_id, notification_phone, team_id)
      VALUES ('location-1', '${SOURCE_ORG}', '${SITE_ID}', 'main', 'asset-hero', 'asset-og', '+66000000000', 'team-source');
    INSERT INTO experiences(id, organization_id, site_id, location_id, og_image_asset_id)
      VALUES ('experience-1', '${SOURCE_ORG}', '${SITE_ID}', 'location-1', 'asset-og');
    INSERT INTO menus(id, organization_id, site_id) VALUES ('menu-1', '${SOURCE_ORG}', '${SITE_ID}');
    INSERT INTO menu_items(id, menu_id) VALUES ('menu-item-1', 'menu-1');
    INSERT INTO media_assets(id, organization_id, site_id, kind, provider, source, status)
      VALUES ('asset-hero', '${SOURCE_ORG}', '${SITE_ID}', 'image', 'r2', 'upload', 'active'),
             ('asset-og', '${SOURCE_ORG}', '${SITE_ID}', 'image', 'r2', 'upload', 'active');
    INSERT INTO experience_media(id, organization_id, site_id, experience_id, asset_id)
      VALUES ('experience-media-1', '${SOURCE_ORG}', '${SITE_ID}', 'experience-1', 'asset-hero');
    INSERT INTO menu_item_media(id, organization_id, site_id, menu_item_id, asset_id)
      VALUES ('menu-media-1', '${SOURCE_ORG}', '${SITE_ID}', 'menu-item-1', 'asset-hero');
    INSERT INTO posts(id, organization_id, site_id, title) VALUES ('post-1', '${SOURCE_ORG}', '${SITE_ID}', 'post');
    INSERT INTO blog_posts(id, organization_id, site_id, title) VALUES ('blog-1', '${SOURCE_ORG}', '${SITE_ID}', 'blog');
    INSERT INTO post_channel_jobs(id, organization_id, post_id) VALUES ('job-1', '${SOURCE_ORG}', 'post-1');
    INSERT INTO tenant_pages(id, organization_id, site_id, path) VALUES ('page-1', '${SOURCE_ORG}', '${SITE_ID}', '/story');
    INSERT INTO tenant_page_variants(id, organization_id, site_id, page_id, locale)
      VALUES ('variant-1', '${SOURCE_ORG}', '${SITE_ID}', 'page-1', 'en');
    INSERT INTO site_config(organization_id, site_id, key, value, updated_at)
      VALUES ('${SOURCE_ORG}', '${SITE_ID}', 'whatsapp_phone', '+66000000000', 'before'),
             ('${SOURCE_ORG}', '${SITE_ID}', 'owner_notification_channels', '["email"]', 'before'),
             ('${SOURCE_ORG}', '${SITE_ID}', 'brand_voice', 'warm', 'before');
    INSERT INTO site_billing(id, site_id, organization_id, stripe_customer_id, stripe_subscription_id, plan, status, payment_status, updated_at)
      VALUES ('sb-site', '${SITE_ID}', '${SOURCE_ORG}', 'cus-source', 'sub-source', 'growth', 'active', 'paid', 'before');
    INSERT INTO site_entitlements(id, site_id, organization_id, key, value, source)
      VALUES ('old-entitlement', '${SITE_ID}', '${SOURCE_ORG}', 'old', 'true', 'better-auth-stripe');
    INSERT INTO member(id, userId, organizationId) VALUES ('member-source', 'user-source', '${SOURCE_ORG}'), ('member-other', 'user-other', '${SOURCE_ORG}');
    INSERT INTO chowbot_conversations(id, organization_id, site_id) VALUES ('conversation-1', '${SOURCE_ORG}', '${SITE_ID}');
    INSERT INTO chowbot_channel_state(user_id, selected_site_id, active_conversation_id, pending_media, pending_confirmation)
      VALUES ('user-source', '${SITE_ID}', 'conversation-1', 'pending-media', 'pending-confirmation');
    INSERT INTO chowbot_channel_state(user_id, selected_site_id, active_conversation_id, pending_media, pending_confirmation)
      VALUES ('user-other', NULL, NULL, 'unrelated-pending-media', 'unrelated-pending-confirmation');
    INSERT INTO chowbot_channel_state(user_id, selected_site_id, active_conversation_id, pending_media, pending_confirmation)
      VALUES ('user-stale', '${SITE_ID}', NULL, 'stale-pending-media', 'stale-pending-confirmation');
    INSERT INTO mcp_workspace_preferences(user_id, organization_id, site_id, location_id, updated_at)
      VALUES ('user-source', '${SOURCE_ORG}', '${SITE_ID}', 'location-1', 'before');
    INSERT INTO dashboard_preferences(id, selected_location_id) VALUES ('prefs-source', 'location-1');
    INSERT INTO facebook_pages_connections(id, organization_id, site_id, encrypted_user_token) VALUES ('fb-1', '${SOURCE_ORG}', '${SITE_ID}', 'fb-secret');
    INSERT INTO google_analytics_connections(id, organization_id, site_id, encrypted_access_token, encrypted_refresh_token) VALUES ('ga-1', '${SOURCE_ORG}', '${SITE_ID}', 'ga-secret', 'ga-refresh');
    INSERT INTO invitation_access_scope(id, organization_id, site_id, location_id) VALUES ('scope-1', '${SOURCE_ORG}', '${SITE_ID}', 'location-1');
    INSERT INTO notifications(id, organization_id, site_id) VALUES ('notification-1', '${SOURCE_ORG}', '${SITE_ID}');
    INSERT INTO chowbot_messages(id, organization_id, site_id) VALUES ('message-1', '${SOURCE_ORG}', '${SITE_ID}');
  `)
}

function executeBatch(db: Database.Database, batch: BatchQuery[]) {
  db.transaction(() => {
    for (const statement of batch) {
      try {
        db.prepare(statement.query).run(...(statement.params ?? []))
      } catch (error) {
        throw new Error(`Failed: ${statement.query.replace(/\s+/g, ' ').trim()} :: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })()
}

function projection(organizationBilling: Record<string, unknown> | null = {
  organization_id: RECIPIENT_ORG,
  stripe_customer_id: 'cus-recipient',
  stripe_subscription_id: 'sub-recipient',
  stripe_subscription_item_id: 'si-recipient',
  status: 'active',
  plan: 'growth',
  current_period_end: '2026-09-01T00:00:00.000Z',
  cancel_at_period_end: 0,
  payment_status: 'paid',
  paid_through: '2026-09-01T00:00:00.000Z',
  past_due_since: null,
  last_paid_invoice_id: 'in-1',
  last_payment_event_created: 1,
  last_payment_event_id: 'evt-1',
  updated_at: NOW,
}) {
  return {
    organizationId: RECIPIENT_ORG,
    effectivePlan: 'growth',
    entitlements: getPlanEntitlements('growth'),
    organizationBilling,
  }
}

test('site transfer batch moves canonical site data, retains ledgers, revokes provider state, and rewrites media safely', () => {
  const db = new Database(':memory:')
  try {
    try {
      createSchema(db)
      seedFixture(db)
    } catch (error) {
      throw new Error(`Fixture setup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: TRANSFER_ID,
      teamGeneration: '7',
    })
    executeBatch(db, batch)

    assert.deepEqual(db.prepare('SELECT organization_id, team_id, plan FROM sites WHERE id = ?').get(SITE_ID), {
      organization_id: RECIPIENT_ORG,
      team_id: null,
      plan: 'growth',
    })
    assert.deepEqual(db.prepare('SELECT organization_id, hero_media_asset_id, og_image_asset_id, notification_phone, team_id FROM business_locations WHERE id = ?').get('location-1'), {
      organization_id: RECIPIENT_ORG,
      hero_media_asset_id: 'asset-hero',
      og_image_asset_id: 'asset-og',
      notification_phone: null,
      team_id: null,
    })
    assert.equal(db.prepare('SELECT organization_id FROM media_assets WHERE id = ?').get('asset-hero')?.organization_id, RECIPIENT_ORG)
    assert.equal(db.prepare('SELECT organization_id, asset_id FROM experience_media WHERE id = ?').get('experience-media-1')?.organization_id, RECIPIENT_ORG)
    assert.equal(db.prepare('SELECT asset_id FROM experience_media WHERE id = ?').get('experience-media-1')?.asset_id, 'asset-hero')
    assert.equal(db.prepare('SELECT asset_id FROM menu_item_media WHERE id = ?').get('menu-media-1')?.asset_id, 'asset-hero')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media_assets WHERE id LIKE ?').get(`__site_transfer_${TRANSFER_ID}__%`)?.count, 0)

    assert.equal(db.prepare('SELECT organization_id FROM notifications WHERE id = ?').get('notification-1')?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT organization_id FROM chowbot_messages WHERE id = ?').get('message-1')?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM facebook_pages_connections WHERE site_id = ?').get(SITE_ID)?.count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM google_analytics_connections WHERE site_id = ?').get(SITE_ID)?.count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM invitation_access_scope WHERE site_id = ?').get(SITE_ID)?.count, 0)
    assert.deepEqual(db.prepare('SELECT site_id, location_id FROM mcp_workspace_preferences WHERE user_id = ?').get('user-source'), { site_id: null, location_id: null })
    assert.equal(db.prepare('SELECT selected_location_id FROM dashboard_preferences WHERE id = ?').get('prefs-source')?.selected_location_id, null)
    assert.deepEqual(db.prepare('SELECT selected_site_id, active_conversation_id, pending_media, pending_confirmation FROM chowbot_channel_state WHERE user_id = ?').get('user-source'), {
      selected_site_id: null,
      active_conversation_id: null,
      pending_media: null,
      pending_confirmation: null,
    })
    assert.deepEqual(db.prepare('SELECT selected_site_id, active_conversation_id, pending_media, pending_confirmation FROM chowbot_channel_state WHERE user_id = ?').get('user-other'), {
      selected_site_id: null,
      active_conversation_id: null,
      pending_media: 'unrelated-pending-media',
      pending_confirmation: 'unrelated-pending-confirmation',
    })
    assert.deepEqual(db.prepare('SELECT selected_site_id, active_conversation_id, pending_media, pending_confirmation FROM chowbot_channel_state WHERE user_id = ?').get('user-stale'), {
      selected_site_id: null,
      active_conversation_id: null,
      pending_media: null,
      pending_confirmation: null,
    })
    assert.equal(db.prepare('SELECT value FROM site_config WHERE site_id = ? AND key = ?').get(SITE_ID, 'brand_voice')?.value, 'warm')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM site_config WHERE site_id = ? AND key IN (?, ?)').get(SITE_ID, 'whatsapp_phone', 'owner_notification_channels')?.count, 0)
    assert.equal(db.prepare('SELECT value FROM site_config WHERE site_id = ? AND key = ?').get(SITE_ID, 'resource_team_generation')?.value, JSON.stringify({ transfer_id: TRANSFER_ID, generation: '7' }))

    assert.equal(db.prepare('SELECT organization_id, plan, stripe_subscription_id, stripe_subscription_item_id FROM site_billing WHERE site_id = ?').get(SITE_ID)?.organization_id, RECIPIENT_ORG)
    const billing = db.prepare('SELECT plan, stripe_subscription_id, stripe_subscription_item_id FROM site_billing WHERE site_id = ?').get(SITE_ID)
    assert.deepEqual(billing, { plan: 'growth', stripe_subscription_id: null, stripe_subscription_item_id: null })
    assert.equal(db.prepare('SELECT organization_id, value FROM site_entitlements WHERE site_id = ? AND key = ?').get(SITE_ID, 'ai_credits')?.organization_id, RECIPIENT_ORG)
    assert.deepEqual(db.prepare('SELECT organization_id, page_id FROM tenant_page_variants WHERE id = ?').get('variant-1'), {
      organization_id: RECIPIENT_ORG,
      page_id: 'page-1',
    })
    assert.equal(db.prepare('SELECT id FROM tenant_pages WHERE id = ?').get('page-1')?.id, 'page-1')
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally {
    db.close()
  }
})

test('missing recipient billing snapshot fails closed if a row appears before the batch starts', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    db.prepare('DELETE FROM organization_billing WHERE organization_id = ?').run(RECIPIENT_ORG)
    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(null),
      now: NOW,
      transferId: `${TRANSFER_ID}-absent`,
    })
    db.prepare(`
      INSERT INTO organization_billing(
        organization_id, status, plan, payment_status, updated_at
      ) VALUES (?, 'active', 'growth', 'paid', ?)
    `).run(RECIPIENT_ORG, NOW)
    assert.throws(() => executeBatch(db, batch), /malformed JSON/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, SOURCE_ORG)
  } finally {
    db.close()
  }
})

test('missing source site fails closed before creating any transfer projections', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    db.exec(`
      INSERT INTO organization(id) VALUES ('${SOURCE_ORG}'), ('${RECIPIENT_ORG}');
      INSERT INTO organization_billing(
        organization_id, status, plan, payment_status, updated_at
      ) VALUES ('${RECIPIENT_ORG}', 'active', 'growth', 'paid', '${NOW}');
    `)

    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-missing-site`,
    })

    assert.throws(() => executeBatch(db, batch), /malformed JSON/)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM site_config').get()?.count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM site_billing').get()?.count, 0)
  } finally {
    db.close()
  }
})

test('site already owned by another organization fails closed before child reparenting', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    db.prepare('UPDATE sites SET organization_id = ?, team_id = NULL WHERE id = ?').run(RECIPIENT_ORG, SITE_ID)

    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-wrong-owner`,
    })

    assert.throws(() => executeBatch(db, batch), /malformed JSON/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, RECIPIENT_ORG)
    assert.equal(db.prepare('SELECT organization_id FROM posts WHERE id = ?').get('post-1')?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM site_config WHERE site_id = ? AND organization_id = ?').get(SITE_ID, RECIPIENT_ORG)?.count, 0)
  } finally {
    db.close()
  }
})

test('pending transfer scope mismatch fails closed, while the exact site/source row is accepted', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    db.prepare(`
      INSERT INTO site_transfer_requests(id, site_id, from_organization_id, status)
      VALUES (?, ?, ?, 'pending')
    `).run(`${TRANSFER_ID}-scope`, 'different-site', SOURCE_ORG)

    const mismatchedBatch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-scope`,
      requirePendingTransferId: `${TRANSFER_ID}-scope`,
    })

    assert.throws(() => executeBatch(db, mismatchedBatch), /malformed JSON/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT site_id FROM site_transfer_requests WHERE id = ?').get(`${TRANSFER_ID}-scope`)?.site_id, 'different-site')

    db.prepare('UPDATE site_transfer_requests SET site_id = ?, from_organization_id = ? WHERE id = ?').run(SITE_ID, RECIPIENT_ORG, `${TRANSFER_ID}-scope`)
    const wrongSourceBatch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-scope`,
      requirePendingTransferId: `${TRANSFER_ID}-scope`,
    })
    assert.throws(() => executeBatch(db, wrongSourceBatch), /malformed JSON/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, SOURCE_ORG)

    db.prepare('UPDATE site_transfer_requests SET from_organization_id = ? WHERE id = ?').run(SOURCE_ORG, `${TRANSFER_ID}-scope`)
    const matchingBatch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-scope`,
      requirePendingTransferId: `${TRANSFER_ID}-scope`,
    })
    executeBatch(db, matchingBatch)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, RECIPIENT_ORG)
  } finally {
    db.close()
  }
})

test('deferred foreign-key violations still reject the transfer batch at commit', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId: `${TRANSFER_ID}-fk-violation`,
    })
    batch.push({
      query: `
        INSERT INTO tenant_page_variants (id, organization_id, site_id, page_id, locale)
        VALUES (?, ?, ?, ?, ?)
      `,
      params: ['invalid-fk-variant', RECIPIENT_ORG, SITE_ID, 'missing-page', 'en'],
    })

    assert.throws(() => executeBatch(db, batch), /FOREIGN KEY constraint failed/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, SOURCE_ORG)
  } finally {
    db.close()
  }
})

test('temporary media prefix collisions fail before ownership mutation', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    const transferId = `${TRANSFER_ID}-collision`
    const transferPrefix = `__site_transfer_${transferId}__`
    db.prepare(`
      INSERT INTO media_assets(id, organization_id, site_id, kind, provider, source, status)
      VALUES (?, ?, ?, 'image', 'r2', 'upload', 'active')
    `).run(`${transferPrefix}existing`, SOURCE_ORG, SITE_ID)

    const batch = buildSiteTransferMutationBatch({
      siteId: SITE_ID,
      fromOrgId: SOURCE_ORG,
      toOrgId: RECIPIENT_ORG,
      projection: projection(),
      now: NOW,
      transferId,
    })

    assert.throws(() => executeBatch(db, batch), /malformed JSON/)
    assert.equal(db.prepare('SELECT organization_id FROM sites WHERE id = ?').get(SITE_ID)?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT organization_id FROM media_assets WHERE id = ?').get(`${transferPrefix}existing`)?.organization_id, SOURCE_ORG)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM media_assets WHERE id LIKE ?').get(`${transferPrefix}%`)?.count, 1)
  } finally {
    db.close()
  }
})

test('naive media scope reparent is rejected by the current media trigger', () => {
  const db = new Database(':memory:')
  try {
    createSchema(db)
    seedFixture(db)
    assert.throws(
      () => db.prepare('UPDATE media_assets SET organization_id = ? WHERE id = ?').run(RECIPIENT_ORG, 'asset-hero'),
      /media scope mismatch/,
    )
    assert.equal(db.prepare('SELECT organization_id FROM media_assets WHERE id = ?').get('asset-hero')?.organization_id, SOURCE_ORG)
  } finally {
    db.close()
  }
})
