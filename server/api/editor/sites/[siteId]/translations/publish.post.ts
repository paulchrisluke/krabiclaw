import type { D1PreparedStatement } from '@cloudflare/workers-types'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isDemoOrg } from '~/server/utils/demo'
import { buildTranslationInventory } from '~/server/utils/translation-inventory'
import { parseScope } from '~/server/utils/translation-helpers'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as { locale?: string; scope?: string }
  if (!body.locale) return jsonResponse({ error: 'locale is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const inventory = await buildTranslationInventory(db, site.organization_id, siteId, {
      targetLocale: body.locale,
      scope: parseScope(body.scope),
      includePublished: true,
    })
    const drafts = inventory.items.filter(item => item.translation_status === 'draft')
    const now = new Date().toISOString()

    const statements: D1PreparedStatement[] = []

    for (const item of drafts) {
      if (item.entity_type === 'site_content') {
        if (!item.location_id) {
          statements.push(db.prepare(`
            UPDATE site_content_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND locale = ? AND page = ? AND field = ?
              AND location_id IS NULL AND source_hash = ? AND status = 'draft'
          `).bind(now, now, session.user.id, site.organization_id, siteId, inventory.target_locale, item.page, item.field, item.source_hash))
        } else {
          statements.push(db.prepare(`
            UPDATE site_content_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND location_id = ? AND locale = ? AND page = ? AND field = ?
              AND source_hash = ? AND status = 'draft'
          `).bind(now, now, session.user.id, site.organization_id, siteId, item.location_id, inventory.target_locale, item.page, item.field, item.source_hash))
        }
      } else if (item.entity_type === 'menu') {
        statements.push(db.prepare(`
          UPDATE menu_translations
          SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
          WHERE organization_id = ? AND site_id = ? AND menu_id = ? AND locale = ?
            AND source_hash = ? AND status = 'draft'
        `).bind(now, now, session.user.id, site.organization_id, siteId, item.entity_id, inventory.target_locale, item.source_hash))
      } else if (item.entity_type === 'menu_item') {
        statements.push(db.prepare(`
          UPDATE menu_item_translations
          SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
          WHERE organization_id = ? AND site_id = ? AND menu_item_id = ? AND locale = ?
            AND source_hash = ? AND status = 'draft'
        `).bind(now, now, session.user.id, site.organization_id, siteId, item.entity_id, inventory.target_locale, item.source_hash))
      } else if (item.entity_type === 'business_location') {
        statements.push(db.prepare(`
          UPDATE business_location_translations
          SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
          WHERE organization_id = ? AND site_id = ? AND location_id = ? AND locale = ?
            AND source_hash = ? AND status = 'draft'
        `).bind(now, now, session.user.id, site.organization_id, siteId, item.entity_id, inventory.target_locale, item.source_hash))
      } else if (item.entity_type === 'post') {
        statements.push(db.prepare(`
          UPDATE post_translations
          SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
          WHERE organization_id = ? AND site_id = ? AND post_id = ? AND locale = ?
            AND source_hash = ? AND status = 'draft'
        `).bind(now, now, session.user.id, site.organization_id, siteId, item.entity_id, inventory.target_locale, item.source_hash))
      }
    }

    const localeId = `locale::${site.organization_id}::${siteId}::${inventory.target_locale}`
    statements.push(db.prepare(`
      INSERT INTO site_locales
        (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 0, 'published', 1, ?, ?)
      ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET
        is_source = excluded.is_source,
        status = excluded.status,
        fallback_enabled = excluded.fallback_enabled,
        updated_at = excluded.updated_at
    `).bind(
      localeId,
      site.organization_id,
      siteId,
      inventory.target_locale,
      now,
      now,
    ))

    const batchResults = await db.batch(statements)

    const publishedCount = (batchResults || []).slice(0, drafts.length).reduce((sum, res) => sum + (res.meta?.changes ?? 0), 0)

    const result = {
      source_locale: inventory.source_locale,
      target_locale: inventory.target_locale,
      scope: inventory.scope,
      published_items: publishedCount,
      skipped_items: inventory.items.length - publishedCount,
    }

    return jsonResponse({ success: true, result })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to publish translations' }, { status: 400 })
  }
})
